// スコア表の写真を AI（Anthropic の Messages API）で読み取って ScoreSheet の形にする。サーバー専用。
//
// キーは Rinnavi 専用の ANTHROPIC_API_KEY（他サービスと共有しない方針）。未設定なら読み取りは使えず、
// 画面は手入力で動く。読み取り結果は必ず人が確認してから保存する（手書きの読み違いがあるため）。

import { analyzeGame, emptySheet, goalOrder, goalSituations, playerName, type Half, type ScoreSheet, type SheetTeam, type Side } from "./scoreSheet";

const MODEL = "claude-sonnet-5-5";

const PROMPT = `これは日本のアイスホッケーリーグ「Misconduct Hockey League」の手書きのスコア表の写真です。
記入内容を読み取り、record_score_sheet ツールで返してください。

用紙の構成:
- 上部: Date（例 2026.9.6 → "2026/9/6"）、Time、#（試合番号）、Div（P/G/S/Bro/Bra/C/I/WG/WB/35 のうち丸で囲まれたもの）
- Goal 欄: Visitor と Home のチーム名、ハーフ 1・2・OT の得点と Total。その右の SOG 欄はハーフ 1・2・OT のシュート数と Total
- Visitor team / Home team の各欄:
  - 左: Pos.=G の行がゴーリー（# と Name）。その下の # / C/A / Name / G / A / P の表が選手（P はペナルティの分数）
  - 中央: Half / Time / G / A / A の表が「そのチームの得点」の記録（Time はハーフの経過時間、G は得点者の背番号、A はアシストの背番号）
  - 右: Harf / # / Time / P.Time / Penalty の表が「そのチームの反則」の記録

必ず record_score_sheet ツールを1回だけ呼んで返してください（文章での回答は不要です）。

読み取りのルール:
- 二重線・塗りつぶしで消された値は無視し、訂正後の値を使う。消された行は丸ごと除く
- 読めない値は推測せず空にする。数字の欄で空なら 0（SOG が空なら null）
- 時間は "m:ss" の形（例 "1:29"、"10:06"）
- ディビジョン名は Platinum / Gold / Silver / Bronze / Brass / Copper / Iron / Women Gold / Women Bronze / 35&Over のどれか
- 名前はカタカナのまま
- Visitor と Home の両方について、得点の記録（scoring）と反則の記録（penalties）を漏れなく入れる`;

const team = {
  type: "object",
  properties: {
    name: { type: "string" },
    goals: { type: "array", items: { type: "integer" }, description: "[前半, 後半, OT]" },
    total: { type: "integer" },
    sog: { type: "array", items: { type: ["integer", "null"] }, description: "[前半, 後半, OT] のシュート数" },
    sogTotal: { type: ["integer", "null"] },
    goalie: { type: "object", properties: { no: { type: "string" }, name: { type: "string" } }, required: ["no", "name"] },
    players: {
      type: "array",
      items: {
        type: "object",
        properties: {
          no: { type: "string" },
          name: { type: "string" },
          role: { type: "string", description: "C / A / 空" },
        },
        required: ["no", "name"],
      },
    },
    scoring: {
      type: "array",
      description: "このチームの得点の記録",
      items: {
        type: "object",
        properties: {
          half: { type: "integer", description: "1=前半 2=後半 3=OT" },
          time: { type: "string" },
          scorer: { type: "string" },
          assist1: { type: "string" },
          assist2: { type: "string" },
        },
        required: ["half", "time", "scorer"],
      },
    },
    penalties: {
      type: "array",
      description: "このチームの反則の記録",
      items: {
        type: "object",
        properties: {
          half: { type: "integer" },
          no: { type: "string" },
          time: { type: "string" },
          minutes: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["half", "no", "time", "minutes"],
      },
    },
  },
  required: ["name", "goals", "total", "goalie", "players", "scoring", "penalties"],
};

const TOOL = {
  name: "record_score_sheet",
  description: "スコア表から読み取った内容を記録する",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", description: "YYYY/M/D" },
      time: { type: "string" },
      gameNo: { type: "string" },
      division: { type: "string" },
      visitor: team,
      home: team,
    },
    required: ["date", "gameNo", "division", "visitor", "home"],
  },
};

type RawTeam = Partial<SheetTeam> & {
  scoring?: { half?: number; time?: string; scorer?: string; assist1?: string; assist2?: string }[];
  penalties?: { half?: number; no?: string; time?: string; minutes?: number; reason?: string }[];
};

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
const intOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const half = (v: unknown): Half => (v === 2 ? 2 : v === 3 ? 3 : 1);

/** AI の出力（形が崩れていることもある）を ScoreSheet に整える */
export function normalizeAiSheet(raw: Record<string, unknown>): ScoreSheet {
  const s = emptySheet();
  s.date = str(raw.date).replace(/[.\-年月]/g, "/").replace(/日$/, "");
  s.time = str(raw.time);
  s.gameNo = str(raw.gameNo).replace(/^#/, "");
  s.division = str(raw.division);
  for (const side of ["visitor", "home"] as Side[]) {
    const t = (raw[side] ?? {}) as RawTeam;
    const goals = Array.isArray(t.goals) ? t.goals : [];
    const sog = Array.isArray(t.sog) ? t.sog : [];
    s[side] = {
      name: str(t.name),
      goals: [int(goals[0]), int(goals[1]), int(goals[2])],
      total: int(t.total),
      sog: [intOrNull(sog[0]), intOrNull(sog[1]), intOrNull(sog[2])],
      sogTotal: intOrNull(t.sogTotal),
      goalie: { no: str(t.goalie?.no), name: str(t.goalie?.name) },
      players: (Array.isArray(t.players) ? t.players : []).map((p) => ({
        no: str(p.no),
        name: str(p.name),
        role: str(p.role),
        goals: int(p.goals),
        assists: int(p.assists),
        pim: int(p.pim),
      })),
    };
    for (const g of Array.isArray(t.scoring) ? t.scoring : []) {
      s.goals.push({ side, half: half(g.half), time: str(g.time), scorer: str(g.scorer), assist1: str(g.assist1) || undefined, assist2: str(g.assist2) || undefined });
    }
    for (const p of Array.isArray(t.penalties) ? t.penalties : []) {
      s.penalties.push({ side, half: half(p.half), no: str(p.no), time: str(p.time), minutes: int(p.minutes) || 2, reason: str(p.reason) });
    }
  }
  return s;
}

export class AiReadError extends Error {
  /** API が返したエラーの種類と説明（秘密情報は含まない。原因の切り分け用） */
  detail?: string;
  constructor(code: string, detail?: string) {
    super(code);
    this.detail = detail;
  }
}

export async function readScoreSheetImage(base64: string, mediaType: string): Promise<ScoreSheet> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiReadError("no_key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      tools: [TOOL],
      // このモデルはツールの強制（type "tool" / "any"）に対応しないので、プロンプトで呼ぶよう指示する
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(110_000),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("score sheet AI read failed", res.status, text.slice(0, 500));
    let detail: string | undefined;
    try {
      const e = (JSON.parse(text) as { error?: { type?: string; message?: string } }).error;
      detail = [e?.type, e?.message].filter(Boolean).join(": ").slice(0, 200) || undefined;
    } catch {
      // 本文が JSON でなければ詳細なし
    }
    throw new AiReadError(`api_${res.status}`, detail);
  }
  const body = (await res.json()) as {
    content?: { type: string; input?: Record<string, unknown>; text?: string }[];
    stop_reason?: string;
  };
  // 出力が上限で切れると後半（Home の欄など）が欠けるので、使わずにエラーにする
  if (body.stop_reason === "max_tokens") throw new AiReadError("truncated", "出力が長すぎて途中で切れました");
  const input = body.content?.find((c) => c.type === "tool_use")?.input ?? jsonFromText(body.content);
  if (!input) throw new AiReadError("no_result");
  return normalizeAiSheet(input);
}

/** ツールを使わず文章で返ってきたとき、その中の JSON を拾う */
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

// ───────── AI 総評（試合の分析から、両チームへのアドバイスを書く） ─────────

export interface AiReview {
  summary: string;
  teams: { team: string; good: string[]; improve: string[] }[];
  players: string[];
  createdAt: string;
}

function reviewInput(s: ScoreSheet): string {
  const a = analyzeGame(s);
  const sit = goalSituations(s);
  const pct = (v: number | null) => (v === null ? "不明" : `${Math.round(v * 100)}%`);
  const who = (side: Side, no?: string) => (no ? `#${no}${playerName(s[side], no) ? ` ${playerName(s[side], no)}` : ""}` : "");
  const lines = [
    `試合: ${s.date} ${s.division} #${s.gameNo}`,
    `スコア: ${s.visitor.name} ${s.visitor.total} - ${s.home.total} ${s.home.name}`,
  ];
  for (const side of ["visitor", "home"] as Side[]) {
    const x = a[side];
    lines.push(
      `【${x.team}】得点 前半${x.byHalf.for[0]} 後半${x.byHalf.for[1]} OT${x.byHalf.for[2]} / 失点 前半${x.byHalf.against[0]} 後半${x.byHalf.against[1]}` +
        ` / シュート ${x.shots ?? "記録なし"} 決定率 ${pct(x.shootingPct)}` +
        ` / ゴーリー ${x.goalie.name || x.goalie.no || "不明"} セーブ率 ${pct(x.goalie.savePct)}（${x.goalie.saves ?? "?"}/${x.goalie.shotsFaced ?? "?"}）` +
        ` / PP得点 ${x.powerPlayGoals} SH得点 ${x.shortHandedGoals} 反則 ${x.penaltyMinutes}分` +
        `${x.scoredFirst ? " / 先制" : ""}${x.comeback ? " / 逆転勝ち" : ""}`
    );
  }
  lines.push("得点経過:");
  [...s.goals]
    .map((g, i) => ({ g, tag: sit[i] }))
    .sort((p, q) => goalOrder(p.g, q.g))
    .forEach(({ g, tag }) => {
      const assists = [who(g.side, g.assist1), who(g.side, g.assist2)].filter(Boolean).join("・");
      lines.push(`- ${g.half === 1 ? "前半" : g.half === 2 ? "後半" : "OT"} ${g.time} ${s[g.side].name} ${who(g.side, g.scorer)}${assists ? `（A ${assists}）` : ""}${tag ? ` [${tag}]` : ""}`);
    });
  if (s.penalties.length) {
    lines.push("反則:");
    for (const p of s.penalties) lines.push(`- ${p.half === 1 ? "前半" : "後半"} ${p.time} ${s[p.side].name} ${who(p.side, p.no)} ${p.reason} ${p.minutes}分`);
  }
  return lines.join("\n");
}

const REVIEW_PROMPT = `あなたはアマチュアのアイスホッケーリーグ（MHL）の試合を見るコーチです。
次の1試合のスコア表の集計だけをもとに、両チームの選手向けに「AI総評」を日本語で書いてください。

ルール:
- データに無いこと（戦術・体格・プレー内容の推測など）は書かない。数字から言えることだけ
- 前向きで具体的に。負けたチームにも良かった点を必ず挙げる
- 選手名は「#番号 名前」の形
- シュート数（SOG）が記録なしなら、決定率・セーブ率には触れない

次の JSON だけを返してください（前後に文章を付けない）:
{"summary":"試合全体の総評（2〜3文）","teams":[{"team":"チーム名","good":["良かった点（各40字以内、1〜3個）"],"improve":["次への改善点（各40字以内、1〜3個）"]}],"players":["注目選手と理由（各40字以内、1〜3個）"]}`;

export async function reviewScoreSheet(s: ScoreSheet): Promise<AiReview> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiReadError("no_key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: `${REVIEW_PROMPT}\n\n---\n${reviewInput(s)}` }],
    }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("score sheet review failed", res.status, text.slice(0, 500));
    throw new AiReadError(`api_${res.status}`);
  }
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = jsonFromText(body.content);
  if (!raw || typeof raw.summary !== "string") throw new AiReadError("no_result");
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, 3) : []);
  return {
    summary: raw.summary.slice(0, 400),
    teams: (Array.isArray(raw.teams) ? raw.teams : []).slice(0, 2).map((t: { team?: unknown; good?: unknown; improve?: unknown }) => ({
      team: typeof t?.team === "string" ? t.team.slice(0, 40) : "",
      good: list(t?.good),
      improve: list(t?.improve),
    })),
    players: list(raw.players),
    createdAt: new Date().toISOString(),
  };
}
