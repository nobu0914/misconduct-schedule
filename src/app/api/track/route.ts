import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";
import {
  ACTIVITY_LOG_KEY,
  ACTIVITY_LOG_MAX,
  FEATURE_MAX,
  MAX_DWELL_SECONDS,
  normalizeQuery,
  type ActivityEntry,
  isBrowser,
  isDevice,
  isEventType,
  isVisitorId,
  jstHour,
  normalizeReferrer,
  normalizeTrackedPath,
  visitBucket,
} from "@/lib/analyticsConstants";

export const dynamic = "force-dynamic";

// KV のキー（日付は既存の PV と同じく UTC の日付）
//   pv:{日}:{パス} / pv:{日}:total   PV
//   hr:{日}            時間帯（JST の時 → PV）
//   ss:{日}            訪問（セッション）数
//   ref:{日}           流入元（ホスト名 → 訪問数）
//   dw:{日}            滞在時間（パス → 秒の合計）
//   uv:{日} / uvret:{日}  その日の訪問者 / うちリピーター（HyperLogLog）
//   dev:{日} / br:{日}    端末 / ブラウザ（→ その日の訪問者数）
//   vd:{訪問者ID}      来訪日数（累計）
//   vhist              来訪日数の分布（区分 → 人数）
//   analytics:since    訪問者の計測を始めた日
//   actlog             行動ログ（端末ごとのページ表示・機能の利用を時系列で。新しい順に最大5000件）
const VISITOR_TTL_SECONDS = 400 * 86400;

/** 行動ログに足す（失敗しても集計は止めない） */
async function logActivity(e: Omit<ActivityEntry, "at">): Promise<void> {
  try {
    await kv.lpush(ACTIVITY_LOG_KEY, { at: new Date().toISOString(), ...e });
    await kv.ltrim(ACTIVITY_LOG_KEY, 0, ACTIVITY_LOG_MAX - 1);
  } catch (err) {
    console.error("activity log failed:", err);
  }
}

const deviceOf = (raw: unknown) => (isDevice(raw) ? raw : undefined);
const browserOf = (raw: unknown) => (isBrowser(raw) ? raw : undefined);

/** その日の初回だけ訪問者として数える（同時に開いたタブで二重に数えない） */
async function recordVisitor(today: string, vid: string, device: unknown, browser: unknown): Promise<void> {
  const first = await kv.set(`vday:${today}:${vid}`, 1, { nx: true, ex: 2 * 86400 });
  if (first !== "OK") return;

  const days = await kv.incr(`vd:${vid}`);
  const ops: Promise<unknown>[] = [
    kv.expire(`vd:${vid}`, VISITOR_TTL_SECONDS),
    kv.pfadd(`uv:${today}`, vid),
    kv.set("analytics:since", today, { nx: true }),
  ];
  if (days > 1) ops.push(kv.pfadd(`uvret:${today}`, vid));
  // 来訪日数の分布は、区分が変わったときだけ人を移す
  const bucket = visitBucket(days);
  const before = days > 1 ? visitBucket(days - 1) : null;
  if (bucket !== before) {
    ops.push(kv.hincrby("vhist", bucket, 1));
    if (before) ops.push(kv.hincrby("vhist", before, -1));
  }
  if (isDevice(device)) ops.push(kv.hincrby(`dev:${today}`, device, 1));
  if (isBrowser(browser)) ops.push(kv.hincrby(`br:${today}`, browser, 1));
  await Promise.all(ops);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const ops: Promise<unknown>[] = [];

    // 滞在時間（ページを離れたときの beacon、または次のPVに前のページの分として添えられる）
    for (const d of [body.dwell, body.prev]) {
      if (!d) continue;
      const path = normalizeTrackedPath(d.path);
      const sec = Math.round(Number(d.sec));
      if (path && Number.isFinite(sec) && sec > 0) {
        ops.push(kv.hincrby(`dw:${today}`, path, Math.min(sec, MAX_DWELL_SECONDS)));
      }
    }

    // PV追跡（pathはKVのキーになるので、検証したものだけ通す）
    if (body.path !== undefined) {
      const path = normalizeTrackedPath(body.path);
      if (!path) return NextResponse.json({ ok: false }, { status: 400 });

      ops.push(
        kv.incr(`pv:${today}:${path}`),
        kv.incr(`pv:${today}:total`),
        kv.hincrby(`hr:${today}`, String(jstHour(now)), 1)
      );
      if (body.session === true) {
        ops.push(kv.incr(`ss:${today}`));
        const ref = normalizeReferrer(body.ref);
        if (ref) ops.push(kv.hincrby(`ref:${today}`, ref, 1));
      }
      if (isVisitorId(body.vid)) {
        const ref = body.session === true ? normalizeReferrer(body.ref) : null;
        ops.push(
          logActivity({
            vid: body.vid,
            dev: deviceOf(body.device),
            br: browserOf(body.browser),
            t: "pv",
            v: `${path}${normalizeQuery(body.query)}`,
            ...(ref ? { ref } : {}),
          })
        );
        // 訪問者の集計で失敗しても PV の記録は止めない
        ops.push(
          recordVisitor(today, body.vid, body.device, body.browser).catch((e) =>
            console.error("visitor tracking failed:", e)
          )
        );
      }
      await Promise.all(ops);
      return NextResponse.json({ ok: true });
    }

    // イベント追跡 (search, card, rank-search, click)
    if (body.event !== undefined && body.value) {
      if (!isEventType(body.event)) {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      const value = String(body.value).slice(0, body.event === "feature" ? FEATURE_MAX : 100); // 長すぎるキーを防止
      await Promise.all([
        kv.hincrby(`ev:${today}:${body.event}`, value, 1),
        body.event === "feature" && isVisitorId(body.vid)
          ? logActivity({ vid: body.vid, dev: deviceOf(body.device), br: browserOf(body.browser), t: "f", v: value })
          : null,
      ]);
      return NextResponse.json({ ok: true });
    }

    // 滞在時間だけの送信
    if (ops.length > 0) {
      await Promise.all(ops);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
