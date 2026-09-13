import { kv } from "@vercel/kv";
import { createHash, timingSafeEqual } from "node:crypto";
import { clientIp } from "./rateLimit";

/**
 * 管理画面のパスコード照合。
 * - 比較を定数時間にする（文字列比較は一致した文字数で時間が変わる）
 * - 総当たりを防ぐため、IPごとの失敗回数を数えて一定回数で締め出す
 *   （KVが使えない場合は照合だけ行う）
 */

const MAX_FAILURES = 20;
const WINDOW_SECONDS = 900; // 15分

function equals(a: string, b: string): boolean {
  // 長さの違いも隠すためハッシュ同士を比較する
  const ha = createHash("sha256").update(a.toUpperCase()).digest();
  const hb = createHash("sha256").update(b.toUpperCase()).digest();
  return timingSafeEqual(ha, hb);
}

export async function verifyAdminPasscode(
  req: Request,
  passcode: unknown
): Promise<{ ok: true } | { ok: false; status: 401 | 429 | 500 }> {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) return { ok: false, status: 500 };
  if (typeof passcode !== "string" || !passcode) return { ok: false, status: 401 };

  const failKey = `admin:fail:${clientIp(req)}`;
  try {
    const failures = (await kv.get<number>(failKey)) ?? 0;
    if (failures >= MAX_FAILURES) return { ok: false, status: 429 };
  } catch {
    // KVが使えないときは回数制限なしで照合だけ行う
  }

  if (equals(passcode, expected)) return { ok: true };

  try {
    const count = await kv.incr(failKey);
    if (count === 1) await kv.expire(failKey, WINDOW_SECONDS);
  } catch {
    // 記録できなくても認証結果は変わらない
  }
  return { ok: false, status: 401 };
}
