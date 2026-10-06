// events.rinnavi.com（MHL 以外のイベント・練習会の告知）のデータ。
// 書くのは管理者だけ（管理画面）。申込はサイトの中では受けず、外部のフォームへ案内する（ユーザー指示 10/7）。
// 今はインラインホッケーだけだが、アイスホッケーも載せられるよう競技を持つ。
// KV: hash `siteevents:items`（id → イベント）。件数は多くならないので一覧は丸ごと読む。

export type Sport = "inline" | "ice";
export const SPORT_LABEL: Record<Sport, string> = { inline: "インラインホッケー", ice: "アイスホッケー" };
export const SPORT_SHORT: Record<Sport, string> = { inline: "インライン", ice: "アイス" };
export const KINDS = ["練習会", "体験会", "大会", "イベント"] as const;

export interface SiteEvent {
  id: string;
  title: string;
  sport: Sport;
  /** 練習会・体験会・大会・イベント（それ以外の言葉も入れられる） */
  kind: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  start?: string;
  end?: string;
  /** 会場（リンク名） */
  place: string;
  /** 住所（地図のリンクに使う） */
  address?: string;
  fee?: string;
  capacity?: string;
  /** 対象（例 初心者歓迎・小学生以上） */
  target?: string;
  /** 持ち物 */
  bring?: string;
  organizer?: string;
  body?: string;
  /** 申込フォームの URL（http/https だけ） */
  formUrl?: string;
  formLabel?: string;
  /** 申込締切 YYYY-MM-DD */
  deadline?: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ITEMS_KEY = "siteevents:items";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v: unknown, max: number) => text(v, max) || undefined;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** 外部リンクは http(s) だけ通す（javascript: などを入れさせない） */
export function safeUrl(v: unknown): string | undefined {
  const s = text(v, 1000);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** 管理画面から来た内容を整える。足りなければエラーの文言を返す */
export function sanitizeEvent(raw: unknown, base?: SiteEvent): { event?: SiteEvent; error?: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = text(r.title, 80);
  const date = text(r.date, 10);
  const place = text(r.place, 80);
  if (!title) return { error: "タイトルを入れてください。" };
  if (!isDate(date)) return { error: "日付を入れてください。" };
  if (!place) return { error: "会場を入れてください。" };
  const start = text(r.start, 5);
  const end = text(r.end, 5);
  if ((start && !isTime(start)) || (end && !isTime(end))) return { error: "時間は 19:00 の形で入れてください。" };
  const deadline = text(r.deadline, 10);
  if (deadline && !isDate(deadline)) return { error: "締切の日付が正しくありません。" };
  const formRaw = text(r.formUrl, 1000);
  const formUrl = safeUrl(formRaw);
  if (formRaw && !formUrl) return { error: "申込フォームの URL は https:// から入れてください。" };
  const now = new Date().toISOString();
  return {
    event: {
      id: base?.id ?? newEventId(),
      title,
      sport: r.sport === "ice" ? "ice" : "inline",
      kind: text(r.kind, 20) || "イベント",
      date,
      start: start || undefined,
      end: end || undefined,
      place,
      address: opt(r.address, 120),
      fee: opt(r.fee, 80),
      capacity: opt(r.capacity, 40),
      target: opt(r.target, 80),
      bring: opt(r.bring, 120),
      organizer: opt(r.organizer, 60),
      body: opt(r.body, 3000),
      formUrl,
      formLabel: opt(r.formLabel, 20),
      deadline: deadline || undefined,
      published: r.published === true,
      createdAt: base?.createdAt ?? now,
      updatedAt: now,
    },
  };
}

/** 推測されにくい短い id（URL に出る） */
export function newEventId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** 今日（JST）YYYY-MM-DD */
export function todayJst(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

const order = (e: SiteEvent) => `${e.date} ${e.start ?? "99:99"}`;

/** これから（今日を含む・近い順）と、終わったもの（新しい順） */
export function splitEvents(list: SiteEvent[], today = todayJst()): { upcoming: SiteEvent[]; past: SiteEvent[] } {
  const upcoming = list.filter((e) => e.date >= today).sort((a, b) => order(a).localeCompare(order(b)));
  const past = list.filter((e) => e.date < today).sort((a, b) => order(b).localeCompare(order(a)));
  return { upcoming, past };
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** 10/20（火） */
export function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEK[d.getUTCDay()]}）`;
}

export function timeLabel(e: Pick<SiteEvent, "start" | "end">): string {
  return e.start ? `${e.start}${e.end ? `〜${e.end}` : "〜"}` : "";
}

/** 申込を締め切ったか（締切日の終わりまでは受付中） */
export function closed(e: SiteEvent, today = todayJst()): boolean {
  return !!e.deadline && e.deadline < today;
}

/** Google カレンダーに追加するリンク（時間が無ければ終日） */
export function googleCalendarUrl(e: SiteEvent, pageUrl: string): string {
  const ymd = e.date.replace(/-/g, "");
  const hm = (t: string) => t.replace(":", "") + "00";
  let dates: string;
  if (e.start) {
    const end = e.end ?? e.start;
    dates = `${ymd}T${hm(e.start)}/${ymd}T${hm(end)}`;
  } else {
    const next = new Date(`${e.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    dates = `${ymd}/${next.toISOString().slice(0, 10).replace(/-/g, "")}`;
  }
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates,
    ctz: "Asia/Tokyo",
    location: [e.place, e.address].filter(Boolean).join(" "),
    details: pageUrl,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function mapUrl(e: SiteEvent): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address || e.place)}`;
}
