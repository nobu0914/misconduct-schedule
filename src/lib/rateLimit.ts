import { kv } from "@vercel/kv";

/**
 * 単純な固定ウィンドウ方式の回数制限。
 * KV が使えないときは制限せず通す（機能を止めないため）。
 */
export async function isRateLimited(
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, windowSeconds);
    return count > max;
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || "unknown";
}
