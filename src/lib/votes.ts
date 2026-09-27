import { MENU_ITEMS, type Attendance } from "./voteConstants";

/**
 * 水曜練習会の出欠・メニュー投票。
 *
 * 集計は attend / menu をそれぞれハッシュに持ち、`hincrby` で**原子的に**増減する。
 * 旧形式は `vote:{date}` に集計オブジェクトをまるごと保存し、読み込み→加算→書き戻ししていたため、
 * 2人が同時に投票すると片方の票が失われた。旧データは初回アクセス時にハッシュへ移行する。
 *
 * KV 操作は `VoteStore` 越しに呼ぶ（テストで差し替えられるようにするため）。
 */

export interface VoterRecord {
  attendance: Attendance;
  menu: string[];
}

export interface AttendCounts {
  yes: number;
  maybe: number;
  no: number;
}

export interface VoteResult {
  attend: AttendCounts;
  menu: Record<string, number>;
  myVote: VoterRecord | null;
}

export interface VoteInput {
  date: string;
  voterId: string;
  attendance: Attendance;
  menu: string[];
}

/** @vercel/kv のうち、投票で使う操作だけを切り出したもの */
export interface VoteStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number }): Promise<unknown>;
  getset<T>(key: string, value: unknown): Promise<T | null>;
  hgetall<T>(key: string): Promise<T | null>;
  hset(key: string, value: Record<string, number>): Promise<unknown>;
  hincrby(key: string, field: string, by: number): Promise<number>;
}

export const ATTENDANCE_VALUES: Attendance[] = ["yes", "maybe", "no"];
export const EMPTY_RESULT: VoteResult = { attend: { yes: 0, maybe: 0, no: 0 }, menu: {}, myVote: null };

const attendKey = (date: string) => `vote:${date}:attend`;
const menuKey = (date: string) => `vote:${date}:menu`;
export const voterKey = (date: string, voterId: string) => `vote:${date}:voter:${voterId}`;
const legacyKey = (date: string) => `vote:${date}`;
const migrationKey = (date: string) => `vote:${date}:migrating`;

export function isValidVoteDate(date: unknown): date is string {
  return typeof date === "string" && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(date);
}

export function isValidVoterId(voterId: unknown): voterId is string {
  return typeof voterId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(voterId);
}

/**
 * 受け取った値はそのままKVのキーや集計キーになるため、既知の形・既知の値だけを通す。
 * （検証しないと任意のキーを作られ、集計データを際限なく膨らませられる）
 */
export function validateVoteInput(input: unknown): VoteInput | null {
  if (typeof input !== "object" || input === null) return null;
  const { date, voterId, attendance, menu } = input as Record<string, unknown>;

  if (!isValidVoteDate(date)) return null;
  if (!isValidVoterId(voterId)) return null;
  if (!ATTENDANCE_VALUES.includes(attendance as Attendance)) return null;
  if (menu !== undefined && !Array.isArray(menu)) return null;

  const known: readonly string[] = MENU_ITEMS;
  const items = (menu ?? []) as unknown[];
  if (items.length > MENU_ITEMS.length) return null;
  if (!items.every((m) => typeof m === "string" && known.includes(m))) return null;

  return {
    date,
    voterId,
    attendance: attendance as Attendance,
    menu: Array.from(new Set(items as string[])),
  };
}

function toCount(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

function toAttendCounts(hash: Record<string, unknown> | null): AttendCounts {
  return { yes: toCount(hash?.yes), maybe: toCount(hash?.maybe), no: toCount(hash?.no) };
}

function toMenuCounts(hash: Record<string, unknown> | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [item, value] of Object.entries(hash ?? {})) {
    const n = toCount(value);
    if (n > 0) counts[item] = n;
  }
  return counts;
}

/** 旧形式（集計オブジェクト）が残っていればハッシュへ移す。移行に失敗しても表示は続ける */
async function migrateLegacy(store: VoteStore, date: string): Promise<Omit<VoteResult, "myVote"> | null> {
  const legacy = await store.get<{ attend?: Partial<AttendCounts>; menu?: Record<string, number> }>(
    legacyKey(date)
  );
  if (!legacy) return null;

  const attend = toAttendCounts((legacy.attend ?? null) as Record<string, unknown> | null);
  const menu = toMenuCounts((legacy.menu ?? null) as Record<string, unknown> | null);

  try {
    // 同時に複数のリクエストが移行して二重計上しないよう、先に取れた1つだけが書き込む
    const claimed = await store.set(migrationKey(date), 1, { nx: true, ex: 300 });
    if (claimed !== null) {
      const attendSeed = Object.fromEntries(Object.entries(attend).filter(([, v]) => v > 0));
      const writes: Promise<unknown>[] = [];
      if (Object.keys(attendSeed).length > 0) writes.push(store.hset(attendKey(date), attendSeed));
      if (Object.keys(menu).length > 0) writes.push(store.hset(menuKey(date), menu));
      await Promise.all(writes);
    }
  } catch (e) {
    console.error("votes migration error:", e instanceof Error ? e.message : String(e));
  }

  return { attend, menu };
}

export async function readAggregate(
  store: VoteStore,
  date: string
): Promise<Omit<VoteResult, "myVote">> {
  const [attendHash, menuHash] = await Promise.all([
    store.hgetall<Record<string, unknown>>(attendKey(date)),
    store.hgetall<Record<string, unknown>>(menuKey(date)),
  ]);

  if (attendHash || menuHash) {
    return { attend: toAttendCounts(attendHash), menu: toMenuCounts(menuHash) };
  }
  return (await migrateLegacy(store, date)) ?? { attend: { yes: 0, maybe: 0, no: 0 }, menu: {} };
}

export async function readMyVote(
  store: VoteStore,
  date: string,
  voterId: string
): Promise<VoterRecord | null> {
  if (!isValidVoterId(voterId)) return null;
  return (await store.get<VoterRecord>(voterKey(date, voterId))) ?? null;
}

export async function applyVote(store: VoteStore, input: VoteInput): Promise<VoteResult> {
  const { date, voterId, attendance, menu } = input;

  // 差分を入れる前に旧データを移しておく（先に差分を入れるとハッシュが埋まり、移行されなくなる）
  await readAggregate(store, date);

  const newRecord: VoterRecord = { attendance, menu };
  // 直前の投票を原子的に取り出して置き換える。
  // 同じ人が二重送信しても、取り出せた側だけが差し引きを行うので二重計上しない
  const prev = await store.getset<VoterRecord>(voterKey(date, voterId), newRecord);

  const deltas: Promise<unknown>[] = [];
  if (prev) {
    if (ATTENDANCE_VALUES.includes(prev.attendance)) {
      deltas.push(store.hincrby(attendKey(date), prev.attendance, -1));
    }
    for (const item of new Set(prev.menu ?? [])) {
      deltas.push(store.hincrby(menuKey(date), item, -1));
    }
  }
  deltas.push(store.hincrby(attendKey(date), attendance, 1));
  for (const item of menu) {
    deltas.push(store.hincrby(menuKey(date), item, 1));
  }
  await Promise.all(deltas);

  const aggregate = await readAggregate(store, date);
  return { ...aggregate, myVote: newRecord };
}
