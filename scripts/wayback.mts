// Wayback Machine から公式サイトの消えたページを探す共通処理（scripts/fetch-wayback-*.mts で使う）。

export type Fetch = (url: string) => Promise<Response>;

export interface Snapshot {
  timestamp: string;
  original: string;
  /** 元のバイト列（Shift-JIS のまま、Wayback のツールバー無し）。取得用 */
  raw: string;
  /** 画面から開く用（消えた公式ページの代わりのリンク先） */
  view: string;
}

const UPLOADS = "misconduct.co.jp/wordpress/wp-content/uploads/";

/**
 * `{seasonOrdinal}_{kind}_*.htm` の保存ページを探し、ファイル（スラッグ）ごとに最新のものを返す。
 * 最新＝シーズン終了に一番近い＝最終結果、という前提。
 */
export async function findLatestSnapshots(
  prefix: string,
  fetchImpl: Fetch = fetch
): Promise<Map<string, Snapshot>> {
  const cdx =
    "https://web.archive.org/cdx/search/cdx?output=json&filter=statuscode:200&fl=timestamp,original" +
    `&url=${encodeURIComponent(`${UPLOADS}${prefix}*`)}`;
  const res = await fetchImpl(cdx);
  if (!res.ok) throw new Error(`CDX 検索に失敗: HTTP ${res.status}`);
  const rows = ((await res.json()) as string[][]).slice(1); // 先頭行は見出し

  const latest = new Map<string, Snapshot>();
  const slugRe = new RegExp(`${prefix}([a-z0-9]+)\\.htm`, "i");
  for (const [timestamp, original] of rows) {
    const slug = original.match(slugRe)?.[1]?.toLowerCase();
    if (!slug) continue;
    const cur = latest.get(slug);
    if (!cur || timestamp > cur.timestamp) {
      latest.set(slug, {
        timestamp,
        original,
        raw: `https://web.archive.org/web/${timestamp}id_/${original}`,
        view: `https://web.archive.org/web/${timestamp}/${original}`,
      });
    }
  }
  return latest;
}

/** アーカイブに負荷をかけないよう、ページ取得の間を空ける */
export function politePause(): Promise<void> {
  return new Promise((r) => setTimeout(r, 500));
}
