// シーズン番号と表記の相互変換。クライアントからも使うため依存を持たせない
// （schedule.ts は cheerio 等を読み込むのでページ側から import しない）。

/** 53 -> "53rd" のような序数表記に変換 */
export function seasonOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** "53rd" -> 53。解釈できなければ undefined */
export function parseSeasonNumber(label: string | undefined): number | undefined {
  const m = label?.match(/^(\d+)(?:st|nd|rd|th)$/);
  return m ? Number(m[1]) : undefined;
}
