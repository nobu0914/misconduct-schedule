// リーグニュースの見た目（枠と /news で共通）

export const NEWS_TAG_STYLE: Record<string, string> = {
  試合結果: "bg-blue-900/60 text-blue-200",
  注目カード: "bg-orange-900/60 text-orange-200",
  選手: "bg-emerald-900/60 text-emerald-200",
  順位: "bg-violet-900/60 text-violet-200",
  イベント: "bg-pink-900/60 text-pink-200",
  リーグ: "bg-gray-700 text-gray-200",
};

/** "10/9（金）更新" */
export function newsDate(iso: string): string {
  const d = new Date(iso);
  const s = d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" });
  return `${s.replace(/\((.)\)/, "（$1）")}更新`;
}
