import { kv } from "@vercel/kv";

/**
 * `CRON_SECRET` が未設定だと cron ルートは誰でも叩ける。
 * 1回の実行で公式サイトへ数十件アクセスするため、認証が無い場合だけ
 * 最短実行間隔を設けて連打を防ぐ（公式サイトへの負荷対策）。
 *
 * Vercel Cron の実行間隔（日次・週次）より十分短い窓なので、
 * 正規の定期実行がこれで弾かれることはない。
 */
export async function isThrottled(name: string, minIntervalSeconds: number): Promise<boolean> {
  try {
    const acquired = await kv.set(`cron:lock:${name}`, Date.now(), {
      nx: true,
      ex: minIntervalSeconds,
    });
    return acquired === null; // すでにロックがある = 直近に実行済み
  } catch {
    return false; // KVが使えないときは通す
  }
}
