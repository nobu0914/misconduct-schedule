/**
 * 水曜練習会の中止・変更のお知らせ。
 *
 * 公式サイトのレンタル表（rent_YYYYMM.htm）は枠が埋まったままで、
 * 中止になっても表記が変わらない。スクレイピング結果にはそのまま
 * 「インラインホッケー水曜練習会」として残るため、ここで上書きする。
 *
 * 日付は RentalEntry.date と同じ `YYYY/M/D`（ゼロ埋めなし）。
 * 終わった日付は残しておいても表示に影響しない（当日以降のみ告知する）。
 */
export interface PracticeNotice {
  /** 中止 */
  status: "cancelled";
  /** 任意の補足（「都合により」等）。未指定なら理由を出さない */
  reason?: string;
}

export const PRACTICE_NOTICES: Record<string, PracticeNotice> = {
  "2026/9/30": { status: "cancelled" },
};

export function getPracticeNotice(date: string): PracticeNotice | undefined {
  return PRACTICE_NOTICES[date];
}

export function isPracticeCancelled(date: string): boolean {
  return getPracticeNotice(date)?.status === "cancelled";
}

/** 当日以降の中止予定（告知バナー用）。日付の古い順で返す。 */
export function upcomingCancelledPractices(now: Date = new Date()): string[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Object.entries(PRACTICE_NOTICES)
    .filter(([date, notice]) => {
      if (notice.status !== "cancelled") return false;
      const [y, m, d] = date.split("/").map(Number);
      return new Date(y, m - 1, d) >= today;
    })
    .map(([date]) => date)
    .sort((a, b) => {
      const [ay, am, ad] = a.split("/").map(Number);
      const [by, bm, bd] = b.split("/").map(Number);
      return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
    });
}
