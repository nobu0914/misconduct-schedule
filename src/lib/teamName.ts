// チーム名・選手名の照合。クライアントからも使うため依存を持たせない。
//
// 同じチームでも、日程表・順位表・シーズンによって表記が微妙に違う
// （全角/半角、空白の有無、記号、大文字小文字、ベンチ表記 "(A)" の有無など）。
// 表記ゆれは正規化で吸収し、別名そのものが違うもの（"NANASHI Boyz" = "名無しBoyz"）だけ
// TEAM_ALIASES に書く。あいまい一致（部分一致・似ている名前）はしない。
// "日体大DREAMS WB" と "日体大DREAMS WG" のような別チームを取り違えるため。

/**
 * 表記が違っても同じ名前とみなせる形にする。
 * - NFKC（全角英数・全角記号・半角カナを揃える）
 * - アクセント記号を外す（"EUROSPORT MĀVIN" と "EUROSPORT MAVIN" が混在する）
 * - 括弧書き（ベンチ表記 "(A)" など）を除く。全角括弧も NFKC で半角になる
 * - 大文字小文字、空白、区切り記号の違いを無視
 */
export function normalizeName(name: string): string {
  return name
    // 分解してラテン文字のアクセント（U+0300–036F）だけ外し、日本語の濁点等は NFKC で組み直す
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFKC")
    .replace(/\([^)]*\)/g, "")
    .toLowerCase()
    .replace(/[\s　・･.,、。'’"“”!！?？\-‐‑–—ー_~〜]/g, "");
}

/**
 * 日程表の表記 → 順位表・過去シーズンの表記。表記ゆれ（空白・全角など）は
 * normalizeName で吸収されるので、ここには呼び方そのものが違うものだけを書く。
 */
export const TEAM_ALIASES: Record<string, string> = {
  "伊王島": "伊王島観光協会",
  "NANASHI Boyz": "名無しBoyz",
  "武田園35+": "武田園",
};

const NORMALIZED_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_ALIASES).map(([from, to]) => [normalizeName(from), normalizeName(to)])
);

/** 照合用のキー（正規化＋別名の解決）。同じチームなら表記が違っても同じ値になる */
export function teamKey(name: string): string {
  const key = normalizeName(name);
  return NORMALIZED_ALIASES[key] ?? key;
}

/**
 * 一覧から同じチームを探す。ディビジョンを指定したら一致するものだけ
 * （別ディビジョンの同名チームを拾わない）。
 */
export function findTeam<T extends { team: string; divisionLabel: string }>(
  list: T[],
  name: string,
  division?: string
): T | undefined {
  if (!name) return undefined;
  const key = normalizeName(name);
  if (!key) return undefined;
  const keys = [key, NORMALIZED_ALIASES[key]].filter((k): k is string => Boolean(k));
  const inDivision = division ? list.filter((e) => e.divisionLabel === division) : list;
  for (const k of keys) {
    const hit = inDivision.find((e) => normalizeName(e.team) === k);
    if (hit) return hit;
  }
  return undefined;
}
