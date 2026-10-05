// リンク予定（レンタル枠）と、公式のイベント・プログラム紹介を、日付と開始時刻で突き合わせる。
// 一致すれば概要（プログラム名・説明）が分かるので、ゲーム情報・リンク予定の両方でモーダルに出す。

import type { ProgramEntry } from "./events";

/** お知らせ一覧から、プログラム紹介記事に載っているプログラムを全部取り出す */
export function programsFromEvents(items: { programs?: ProgramEntry[] }[] | undefined): ProgramEntry[] {
  return (items ?? []).flatMap((it) => it.programs ?? []);
}

/** program.dateTime は "4月4日(土) 9:00-11:00" 形式。日付と開始時刻が同じものを返す */
export function findMatchingProgram(entry: { date: string; timeStart: string }, programs: ProgramEntry[]): ProgramEntry | undefined {
  if (!programs.length) return undefined;
  const [, m, d] = entry.date.split("/").map(Number);
  const start = entry.timeStart.replace(/^0/, "");
  return programs.find((p) => {
    // 「10月1日」が「10月11日」に一致しないよう、日の直後が数字でないことを見る
    if (!new RegExp(`(^|[^0-9])${m}月${d}日(?![0-9])`).test(p.dateTime)) return false;
    const t = p.dateTime.match(/(\d{1,2}:\d{2})\s*[-－〜~]/);
    return !!t && t[1].replace(/^0/, "") === start;
  });
}
