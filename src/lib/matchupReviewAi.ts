// 対戦カード（チーム相性）の AI総評と「相手に勝つには」。材料は2チームのチーム総評の事実＋直接対決＋8項目の比較。
// 保存・更新のきまりはチーム総評と同じ（src/lib/aiCache.ts、今シーズン分は月1回）。

import { buildDivisionStats, headToHead, radarAxes } from "./matchup";
import { seasonOrdinal } from "./season";
import type { SeasonData } from "./seasonData";
import { profileInput, teamProfile } from "./teamProfile";
import { teamKey } from "./teamName";

/** 書き方を変えたら上げる（古いものを1回だけ作り直す） */
export const MATCHUP_FORMAT = 2;

export interface MatchupReview {
  summary: string;
  /** この対戦の見どころ */
  points: string[];
  /** チーム（teamKey）→ そのチームが相手に勝つためのポイント */
  beat: Record<string, string[]>;
  createdAt: string;
  format?: number;
}

/** 2チームの順番に関係なく同じ保存先にする */
export function matchupKey(season: number, division: string, a: string, b: string): string {
  const [x, y] = [teamKey(a), teamKey(b)].sort();
  return `matchupreview:${season}:${division}:${x}|${y}`;
}

/** AI に渡す材料。どちらかのチームにそのシーズンの成績が無ければ undefined */
export function matchupInput(data: Record<number, SeasonData>, season: number, division: string, a: string, b: string): string | undefined {
  const d = data[season];
  if (!d) return undefined;
  const pa = teamProfile(data, season, division, a);
  const pb = teamProfile(data, season, division, b);
  if (!pa || !pb || pa.stats.gp === 0 || pb.stats.gp === 0) return undefined;
  const all = Object.values(data).flatMap((x) => x.scores);
  const h2h = headToHead(all, pa.stats.team, pb.stats.team);
  const axes = radarAxes(buildDivisionStats(division, d.standings, d.scores, d.players), pa.stats, pb.stats, h2h);
  const A = pa.stats.team;
  const B = pb.stats.team;
  const lines = [
    `対戦カード: ${A} vs ${B}（${seasonOrdinal(season)} ${division}）`,
    "",
    `■ ${A}`,
    profileInput(pa),
    "",
    `■ ${B}`,
    profileInput(pb),
    "",
    `■ 直接対決（全シーズン）: ${A} ${h2h.aWins}勝・${B} ${h2h.bWins}勝・引き分け ${h2h.ties} / 総得点 ${A} ${h2h.aGoals} - ${h2h.bGoals} ${B}`,
  ];
  if (h2h.games.length) {
    lines.push(
      `試合: ${h2h.games
        .slice(0, 8)
        .map((g) => {
          const aHome = teamKey(g.homeTeam) === teamKey(A);
          const ag = aHome ? g.homeScore : g.awayScore;
          const bg = aHome ? g.awayScore : g.homeScore;
          return `${g.season} ${g.date.replace(/^\d{4}\//, "")} ${A} ${ag}-${bg} ${B}`;
        })
        .join(" / ")}`
    );
  }
  lines.push("", "■ 8項目の比較（ディビジョン内での相対値。差が5以上で優勢）");
  for (const x of axes) {
    const side = x.a - x.b >= 5 ? A : x.b - x.a >= 5 ? B : "互角";
    lines.push(`${x.label}: ${A} ${x.rawA} / ${B} ${x.rawB} → ${side}`);
  }
  return lines.join("\n");
}

const MODEL = "claude-sonnet-5-5";

const PROMPT = `あなたは日本のアマチュアアイスホッケーリーグ「MHL」をよく知る解説者です。
下のデータ（事実）だけを使って、2チームの対戦カードの総評を書いてください。

ルール:
- データに無いことは書かない（推測・誇張・架空のコメント・勝敗の予想は禁止）。数字・チーム名はデータのとおり。
- 選手は「#背番号 苗字」で書く（例: データが「#10 久保田一誠」なら「#10 久保田」）。苗字と名前の区切りが判断できない名前はデータのとおり。
- どちらのチームも見下したり批判したりしない。前向きな書き方にする。
- summary は2〜3文（120文字程度）で、この対戦の構図（攻撃力と守備力の比べ合い、直接対決の成績など）。
- points はこの対戦の見どころを2〜3個（各40文字以内）。
- aToB は「1チーム目（データの最初の ■）が2チーム目に勝つためのポイント」、bToA はその逆。各2〜3個・各60文字以内。
  直接対決のスコア、相手が勝てなかった試合、得点王への依存度、失点の多さ、反則、接戦の成績などを根拠に具体的に。根拠が薄ければ1個でよい。
- 「スコア表」の行はアップロードされた一部の試合だけの数字（後半失点率・時間帯ごとの失点など）。使うときは「スコア表のある◯試合では」と試合数を添える。
- です・ます調。

出力は次の JSON だけ（前後に文章を付けない）:
{"summary":"...","points":["..."],"aToB":["..."],"bToA":["..."]}`;

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

export function normalizeMatchupReview(raw: unknown, a: string, b: string): MatchupReview | undefined {
  const r = raw as Record<string, unknown> | undefined;
  if (typeof r?.summary !== "string" || !r.summary.trim()) return undefined;
  const list = (v: unknown, n: number, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, max)).slice(0, n) : [];
  return {
    summary: r.summary.trim().slice(0, 300),
    points: list(r.points, 3, 80),
    beat: { [teamKey(a)]: list(r.aToB, 3, 100), [teamKey(b)]: list(r.bToA, 3, 100) },
    createdAt: new Date().toISOString(),
    format: MATCHUP_FORMAT,
  };
}

/** input の1チーム目を a、2チーム目を b として書かせる */
export async function writeMatchupReview(input: string, a: string, b: string): Promise<MatchupReview> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no_key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2500, messages: [{ role: "user", content: `${PROMPT}\n\n---\n${input}` }] }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) {
    console.error("matchup review failed", res.status, (await res.text()).slice(0, 500));
    throw new Error(`api_${res.status}`);
  }
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const review = normalizeMatchupReview(jsonFromText(body.content), a, b);
  if (!review) throw new Error("no_result");
  return review;
}
