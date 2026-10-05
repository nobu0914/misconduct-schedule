// 修正用の鍵（スコア表を保存した端末だけが持つ）の端末側の保存。コード → 鍵（localStorage）。
// スコア表の修正で使う。チーム別の集計を見られるかどうかは deviceContinueCodes（コンテニューコードで表示している端末）。

const TOKEN_KEY = "rinnavi_edit_tokens";

export function loadEditTokens(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function saveEditToken(code: string, token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ ...loadEditTokens(), [code]: token }));
  } catch {
    // 保存できない環境では、この端末でも修正できないだけ
  }
}

const VIEWED_KEY = "rinnavi_viewed_codes";

/** 共有リンクで開いた試合のコード（端末の一覧には入れないが、チーム別の集計を見る資格として覚える） */
export function rememberViewedCode(code: string) {
  try {
    const cur: string[] = JSON.parse(localStorage.getItem(VIEWED_KEY) ?? "[]");
    localStorage.setItem(VIEWED_KEY, JSON.stringify([code, ...cur.filter((c) => c !== code)].slice(0, 10)));
  } catch {
    // 無視
  }
}

/**
 * この端末で見たことのあるコンテニューコード（保存・呼び出しした試合の一覧、クッキーに覚えたコード、共有リンクで開いた試合）。最大5つ。
 * チーム別の集計は、コンテニューコードや共有リンクでスコア表を表示したことがある端末だけが見られる（ユーザー指示 10/6）。
 */
export function deviceContinueCodes(): string[] {
  const codes = new Set<string>();
  try {
    const viewed = JSON.parse(localStorage.getItem(VIEWED_KEY) ?? "[]");
    if (Array.isArray(viewed)) for (const c of viewed) if (typeof c === "string") codes.add(c);
  } catch {
    // 無視
  }
  try {
    const list = JSON.parse(localStorage.getItem("rinnavi_scoresheets") ?? "[]");
    if (Array.isArray(list)) for (const s of list) if (typeof s?.continueCode === "string") codes.add(s.continueCode);
  } catch {
    // 読めなければクッキーだけ
  }
  try {
    const raw = document.cookie.split("; ").find((c) => c.startsWith("rinnavi_cc="))?.slice("rinnavi_cc=".length) ?? "";
    for (const c of decodeURIComponent(raw).split(",")) if (/^[A-Z0-9]{4,8}$/.test(c)) codes.add(c);
  } catch {
    // 無視
  }
  return [...codes].filter((c) => /^[A-Z0-9]{4,8}$/.test(c)).slice(0, 5);
}
