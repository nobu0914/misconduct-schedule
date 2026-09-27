import {
  applyVote, readAggregate, readMyVote, validateVoteInput, type VoteStore,
} from "../src/lib/votes";
import { MENU_ITEMS } from "../src/lib/voteConstants";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("ok  :", msg); }
}

/** KVの代わりのメモリ実装。各操作の間に await を挟み、実行が交錯する状況を再現する */
function memoryStore(seed: Record<string, unknown> = {}): VoteStore {
  const data = new Map<string, unknown>(Object.entries(seed));
  const yieldTurn = () => new Promise((r) => setTimeout(r, 0));
  return {
    async get<T>(key: string) { await yieldTurn(); return (data.get(key) as T) ?? null; },
    async set(key, value, opts) {
      await yieldTurn();
      if (opts?.nx && data.has(key)) return null;
      data.set(key, value); return "OK";
    },
    async getset<T>(key: string, value: unknown) {
      await yieldTurn();
      const old = (data.get(key) as T) ?? null;
      data.set(key, value);           // 取り出しと差し替えは不可分
      return old;
    },
    async hgetall<T>(key: string) {
      await yieldTurn();
      const h = data.get(key) as Record<string, number> | undefined;
      return h && Object.keys(h).length ? ({ ...h } as T) : null;
    },
    async hset(key, value) {
      await yieldTurn();
      data.set(key, { ...(data.get(key) as object ?? {}), ...value }); return 1;
    },
    async hincrby(key, field, by) {
      await yieldTurn();
      const h = (data.get(key) as Record<string, number>) ?? {};
      h[field] = (h[field] ?? 0) + by;  // 読み書きが一体（Redisのhincrbyと同じ）
      data.set(key, h);
      return h[field];
    },
  };
}

const DATE = "2026/9/16";
const [M1, M2] = MENU_ITEMS;

async function main() {
  // --- 入力検証 ---
  const base = { date: DATE, voterId: "3f2a9b1c-0000-4000-8000-000000000001", attendance: "yes", menu: [M1] };
  assert(validateVoteInput(base) !== null, "正常な入力は通る（UUIDのvoterId）");
  assert(validateVoteInput({ ...base, date: "2026-09-16" }) === null, "日付形式が違えば弾く");
  assert(validateVoteInput({ ...base, voterId: "a".repeat(65) }) === null, "長すぎるvoterIdを弾く");
  assert(validateVoteInput({ ...base, voterId: "../evil" }) === null, "キーに使えない文字のvoterIdを弾く");
  assert(validateVoteInput({ ...base, attendance: "__proto__" }) === null, "未知の出欠値を弾く");
  assert(validateVoteInput({ ...base, menu: ["勝手なメニュー"] }) === null, "未知のメニューを弾く");
  assert(validateVoteInput(null) === null, "本文なしを弾く");
  assert(JSON.stringify(validateVoteInput({ ...base, menu: [M1, M1] })!.menu) === JSON.stringify([M1]),
    "同じメニューの重複は1件に寄せる");

  // --- 同時投票（旧実装ではどちらかが失われていた） ---
  {
    const store = memoryStore();
    await Promise.all([
      applyVote(store, { date: DATE, voterId: "voter-a", attendance: "yes", menu: [M1] }),
      applyVote(store, { date: DATE, voterId: "voter-b", attendance: "yes", menu: [M1] }),
    ]);
    const agg = await readAggregate(store, DATE);
    assert(agg.attend.yes === 2, `2人同時投票で yes=2 (=${agg.attend.yes})`);
    assert(agg.menu[M1] === 2, `メニューも2件 (=${agg.menu[M1]})`);
  }

  // --- 5人同時 ---
  {
    const store = memoryStore();
    await Promise.all(["a", "b", "c", "d", "e"].map((v, i) =>
      applyVote(store, { date: DATE, voterId: `voter-${v}`, attendance: i < 3 ? "yes" : "no", menu: i % 2 ? [M2] : [M1] })
    ));
    const agg = await readAggregate(store, DATE);
    assert(agg.attend.yes === 3 && agg.attend.no === 2, `5人同時: yes=${agg.attend.yes} no=${agg.attend.no}`);
    assert(agg.menu[M1] === 3 && agg.menu[M2] === 2, `メニュー内訳 ${agg.menu[M1]}/${agg.menu[M2]}`);
  }

  // --- 投票のやり直し（前回分が正しく取り消される） ---
  {
    const store = memoryStore();
    await applyVote(store, { date: DATE, voterId: "voter-a", attendance: "yes", menu: [M1] });
    await applyVote(store, { date: DATE, voterId: "voter-a", attendance: "no", menu: [M2] });
    const agg = await readAggregate(store, DATE);
    assert(agg.attend.yes === 0 && agg.attend.no === 1, `やり直し後: yes=${agg.attend.yes} no=${agg.attend.no}`);
    assert(agg.menu[M1] === undefined && agg.menu[M2] === 1, "前回のメニューが取り消される");
    const mine = await readMyVote(store, DATE, "voter-a");
    assert(mine?.attendance === "no", "自分の投票が最新に更新されている");
  }

  // --- 同一人物の二重送信（差分が二重に入らない） ---
  {
    const store = memoryStore();
    await Promise.all([
      applyVote(store, { date: DATE, voterId: "voter-a", attendance: "yes", menu: [M1] }),
      applyVote(store, { date: DATE, voterId: "voter-a", attendance: "yes", menu: [M1] }),
    ]);
    const agg = await readAggregate(store, DATE);
    assert(agg.attend.yes === 1, `同じ人の二重送信でも yes=1 (=${agg.attend.yes})`);
  }

  // --- 旧形式データの移行 ---
  {
    const store = memoryStore({
      [`vote:${DATE}`]: { attend: { yes: 4, maybe: 1, no: 0 }, menu: { [M1]: 3 } },
    });
    const before = await readAggregate(store, DATE);
    assert(before.attend.yes === 4 && before.menu[M1] === 3, "旧データがそのまま読める");
    await applyVote(store, { date: DATE, voterId: "voter-new", attendance: "yes", menu: [M2] });
    const after = await readAggregate(store, DATE);
    assert(after.attend.yes === 5, `移行後に1票足して yes=5 (=${after.attend.yes})`);
    assert(after.menu[M1] === 3 && after.menu[M2] === 1, "旧メニュー集計も保持される");
  }

  // --- 旧形式データがある状態で同時アクセスしても二重計上しない ---
  {
    const store = memoryStore({
      [`vote:${DATE}`]: { attend: { yes: 2, maybe: 0, no: 0 }, menu: {} },
    });
    await Promise.all([readAggregate(store, DATE), readAggregate(store, DATE), readAggregate(store, DATE)]);
    const agg = await readAggregate(store, DATE);
    assert(agg.attend.yes === 2, `同時移行でも yes=2 のまま (=${agg.attend.yes})`);
  }
}
main();
