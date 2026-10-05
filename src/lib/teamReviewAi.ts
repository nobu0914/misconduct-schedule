// チーム総評の AI コメント（サーバー専用）。材料は teamProfile の事実だけ。前向きな書き方にする。

import { LEAGUE_RULES } from "./aiRules";

/** 書き方を変えたら上げる（古い書き方の総評を1回だけ作り直すため）。2: 選手は「#背番号 苗字」 3: スコア表の数字も材料に 4: MHL のきまり（4on4）を指示 */
export const REVIEW_FORMAT = 4;

export interface TeamReview {
  summary: string;
  strengths: string[];
  watch: string[];
  /** このチームに勝つためのポイント（対戦するチーム向け） */
  howToBeat: string[];
  createdAt: string;
  format?: number;
}

const MODEL = "claude-sonnet-5-5";

const PROMPT = `あなたは日本のアマチュアアイスホッケーリーグ「MHL」をよく知る解説者です。

${LEAGUE_RULES}
下のデータ（事実）だけを使って、このチームのシーズンの総評を書いてください。

ルール:
- データに無いことは書かない（推測・誇張・架空のコメントは禁止）。数字・チーム名はデータのとおり。
- 選手は「#背番号 苗字」で書く（例: データが「#10 久保田一誠」なら「#10 久保田」）。苗字と名前の区切りが判断できない名前（カタカナの外国名など）はデータのとおりに書く。背番号が無い選手は苗字だけ。
- 前向きな書き方にする。弱点の指摘や批判、負けの強調はしない。伸びしろは「これから注目したいところ」として前向きに書く。
- ディビジョン内の順位（平均得点◯位など）を根拠に、チームの持ち味を具体的に書く。
- 「スコア表」の行はアップロードされた一部の試合だけの数字。使うときは「スコア表のある◯試合では」と試合数を添え、公式の成績と混ぜない。
- summary は2〜3文（120文字程度）。strengths は持ち味を2〜3個、watch はこれからの注目ポイントを1〜2個。各40文字以内。です・ます調。
- howToBeat は「このチームと対戦するチームが勝つためのポイント」を2〜3個（各60文字以内）。
  データ（勝てなかった試合の相手とスコア、接戦・上位相手の成績、得点王への依存度、失点の多さ、反則など）を根拠に、
  具体的な戦い方として書く（例: 「得点の◯%を◯◯選手が挙げているので、マークを集中させたい」）。
  相手チームを見下したり批判したりしない。根拠が薄ければ1個でよい。

出力は次の JSON だけ（前後に文章を付けない）:
{"summary":"...","strengths":["..."],"watch":["..."],"howToBeat":["..."]}`;

function jsonFromText(content: { type: string; text?: string }[] | undefined): Record<string, unknown> | undefined {
  const text = (content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function normalizeTeamReview(raw: unknown): TeamReview | undefined {
  const r = raw as Record<string, unknown> | undefined;
  if (typeof r?.summary !== "string" || !r.summary.trim()) return undefined;
  const list = (v: unknown, n: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 80)).slice(0, n) : [];
  return {
    summary: r.summary.trim().slice(0, 300),
    strengths: list(r.strengths, 3),
    watch: list(r.watch, 2),
    howToBeat: list(r.howToBeat, 3),
    createdAt: new Date().toISOString(),
    format: REVIEW_FORMAT,
  };
}

export async function writeTeamReview(input: string): Promise<TeamReview> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no_key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: `${PROMPT}\n\n---\n${input}` }] }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) {
    console.error("team review failed", res.status, (await res.text()).slice(0, 500));
    throw new Error(`api_${res.status}`);
  }
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const review = normalizeTeamReview(jsonFromText(body.content));
  if (!review) throw new Error("no_result");
  return review;
}
