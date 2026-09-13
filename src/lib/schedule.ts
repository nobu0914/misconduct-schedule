import * as cheerio from "cheerio";
import iconv from "iconv-lite";

export interface Match {
  no: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  awayTeam: string;
  homeTeam: string;
  division: string;
  status: "scheduled" | "postponed";
  statusLabel?: string;
  /** プレイオフの回戦名（"Quarter Finals" 等）。レギュラーシーズンは undefined */
  round?: string;
  month: string;
  sourceUrl: string;
}

/** 取得元ごとの取得結果（監視・デバッグ用） */
export interface SourceStatus {
  label: string;
  url: string;
  status: number; // HTTPステータス（0 = 例外で到達不可）
  count: number;  // パースできた試合数
  error?: string;
}

export interface ScheduleResult {
  matches: Match[];
  sources: SourceStatus[];
  fetchedAt: string;
}

const BASE = "https://misconduct.co.jp/wordpress/wp-content/uploads/";

/**
 * 取得間隔（秒）。ルートのISRと内部fetchで同じ値を使う。
 * 内部fetchを短くするとセグメント全体の再生成間隔がそちらに引きずられ、
 * 逆に長くすると再生成時に古いキャッシュが使われて鮮度が二重に劣化する。
 */
export const SCHEDULE_REVALIDATE = 86400; // 1日

/** ファイル名に使われる月スラッグ（index 0 = 1月） */
const MONTH_SLUGS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * 月名以外のスケジュールページ。
 * 例: 53rd_schedule_playoff.htm（プレイオフ）
 * 存在しないものは404でスキップされるので、候補として並べておいて問題ない。
 */
const EXTRA_SCHEDULE_SLUGS = ["playoff", "playoffs", "final"];

// 54th シーズン = 2026年10月3日開幕（9/10発表）。シーズンは10月〜翌3月。
// 53rd は2026年9月で終了（+ プレイオフ）。以降は年ごとに繰り上がる。
const BASE_SEASON = 54;
const BASE_SEASON_START_YEAR = 2026;
const SEASON_START_MONTH = 10;

/**
 * Vercel の実行環境は UTC のため、年月の判定は JST に寄せる。
 * 月初の 00:00-09:00 JST に UTC だと前月扱いになるのを防ぐ。
 */
function jstYearMonth(now: Date): { year: number; month: number } {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 };
}

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

/** 指定日時点で進行中のシーズン番号（JST基準） */
export function currentSeasonNumber(now: Date = new Date()): number {
  const { year, month } = jstYearMonth(now);
  const seasonYear = month >= SEASON_START_MONTH ? year : year - 1;
  return BASE_SEASON + (seasonYear - BASE_SEASON_START_YEAR);
}

/**
 * 取得対象URLを日付から自動生成する。
 * 公式サイトは月ファイルを随時追加していくため、URLを固定すると
 * 追加された月が永久に取得されない。進行中シーズンと次シーズンの
 * 全12か月を候補として並べ、存在しない月（404）はスキップする。
 */
export function buildScheduleSources(
  now: Date = new Date()
): { label: string; url: string }[] {
  // 進行中シーズン＋次シーズンを見る。シーズンは10月開幕なので、
  // 9月時点では「53rd の残り試合＋プレイオフ」と「10/3開幕の54th」が同時に必要になる
  const season = currentSeasonNumber(now);
  const sources: { label: string; url: string }[] = [];
  for (const s of [season, season + 1]) {
    const slug = seasonOrdinal(s);
    for (const name of [...MONTH_SLUGS, ...EXTRA_SCHEDULE_SLUGS]) {
      sources.push({ label: `${slug}/${name}`, url: `${BASE}${slug}_schedule_${name}.htm` });
    }
  }
  return sources;
}

/**
 * 月フィルタ用ラベル。データが年をまたぐと "1月" が重複するため、
 * 当年以外は年を付けて一意にする。
 */
export function monthLabel(date: string, now: Date = new Date()): string {
  const [y, m] = date.split("/").map(Number);
  return y === jstYearMonth(now).year ? `${m}月` : `${y}年${m}月`;
}

/**
 * プレイオフ表の Division 欄は "Brass Quarter Finals" のように回戦名込みで入る。
 * フィルタ・色分け（division.includes("Brass") 方式）と噛み合うよう基本名を切り出す。
 * "35 & Over" は月別表では "35&Over" 表記なので空白も詰めて揃える。
 */
export function splitDivision(raw: string): { division: string; round?: string } {
  const m = raw.match(/^(.*?)\s*((?:quarter\s*|semi\s*)?finals?)$/i);
  if (!m || !m[1]) return { division: raw };
  return { division: m[1].replace(/\s*&\s*/g, "&").trim(), round: m[2] };
}

function cleanText(text: string): string {
  return text
    .replace(/ /g, " ")  // &nbsp;
    .replace(/　/g, " ")  // 全角スペース
    .replace(/\s+/g, " ")
    .trim();
}

// 月別表 (論理10列):
// [0]no [1]start [2]〜 [3]end [4]awayName [5]awaySub [6]vs [7]homeSub [8]homeName [9]division
// プレイオフ表 (論理14列): 列数も vs の位置も違う
// [0]no [1]start [2]～ [3]end [4]awaySeed [5]awayName [6]awaySub [7] [8]vs [9]
// [10]homeSub [11]homeName [12]homeSeed [13]division
export async function fetchAndParseSchedule(
  label: string,
  url: string,
  opts: { noStore?: boolean; now?: Date } = {}
): Promise<{ matches: Match[]; source: SourceStatus }> {
  const matches: Match[] = [];
  const now = opts.now ?? new Date();
  const source: SourceStatus = { label, url, status: 0, count: 0 };

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
      ...(opts.noStore
        ? { cache: "no-store" as const }
        : { next: { revalidate: SCHEDULE_REVALIDATE } }),
    });
    source.status = res.status;

    if (!res.ok) {
      // 未公開の月は404になるため、404はエラー扱いしない
      if (res.status !== 404) source.error = `HTTP ${res.status}`;
      return { matches, source };
    }

    // Shift-JIS でデコード
    const buffer = await res.arrayBuffer();
    const text = iconv.decode(Buffer.from(buffer), "shift_jis");

    const $ = cheerio.load(text);
    let currentDate = "";
    // 「試合行のはずなのに読めなかった行」の数。構造変更の検知に使う
    let unparsedGameRows = 0;

    // colspanを展開して論理列配列を返す
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function expandCells(row: any): string[] {
      const result: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $(row).find("td").each((_: number, td: any) => {
        const text = cleanText($(td).text());
        const colspan = parseInt($(td).attr("colspan") || "1", 10);
        for (let i = 0; i < colspan; i++) result.push(text);
      });
      return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $("tr").each((_: number, row: any) => {
      const tds = $(row).find("td");
      if (tds.length === 0) return;

      // colspan展開前のテキスト配列（日付検出用）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawCells = tds.map((_: number, td: any) => cleanText($(td).text())).get() as string[];

      // 日付ヘッダー行: いずれかのセルが "YYYY/M/D" パターンを含む
      const dateCell = rawCells.find((c) => /\d{4}\/\d{1,2}\/\d{1,2}/.test(c));
      if (dateCell) {
        const m = dateCell.match(/(\d{4}\/\d{1,2}\/\d{1,2})/);
        if (m) currentDate = m[1];
        return;
      }

      if (!currentDate) return;

      // colspanを展開した論理列で試合行を判定
      // ビジター枠(colspan=3)があっても論理10列になる
      const cells = expandCells(row);

      // 時刻があり、かつ試合番号か "vs" を持つ行＝対戦カードのはず。
      // 催し物（Pick Up Hockey 等）や時間調整の行、対戦カード未定の枠はここに入らない。
      // 列構成が変わった場合も拾えるよう、列数チェックより前に数える
      const timeStart = cells[1];
      const looksLikeGame =
        /^\d{1,2}:\d{2}$/.test(timeStart) &&
        (/^\d+$/.test(cells[0]) || cells.includes("vs"));
      if (looksLikeGame) unparsedGameRows++;

      if (cells.length < 10) return;
      if (!/^\d{1,2}:\d{2}$/.test(timeStart)) return;

      const timeEnd = cells[3];

      const withSub = (name: string, sub: string) => (sub ? `${name} (${sub})` : name);
      const vsIdx = cells.indexOf("vs");
      // プレイオフ表は14列で vs が [8]。月別表は10列で vs が [6]
      const isPlayoff = cells.length >= 14 && vsIdx === 8;

      let awayTeam: string;
      let homeTeam: string;
      let rawDivision: string;

      if (isPlayoff) {
        // 試合番号が "PO1" 等で連番にならないため、vs の位置を試合行の条件にする
        awayTeam = withSub(cells[5], cells[6]);
        homeTeam = withSub(cells[11], cells[10]);
        rawDivision = cells[13];
        // 対戦カードが未定の行（両チーム空欄）は取り込まない
        if (!cells[5] && !cells[11]) return;
      } else {
        if (!/^\d+$/.test(cells[0])) return;
        // col[6]="vs"なら通常試合、それ以外(ビジター等)はサブ情報なしとして扱う
        const isNormal = vsIdx === 6;
        awayTeam = withSub(cells[4], isNormal ? cells[5] : "");
        homeTeam = withSub(cells[8], isNormal ? cells[7] : "");
        rawDivision = cells[9];
      }

      const { division, round } = splitDivision(rawDivision);
      const isPostponed = cells.join(" ").includes("延期");

      matches.push({
        no: cells[0],
        date: currentDate,
        timeStart,
        timeEnd,
        awayTeam,
        homeTeam,
        division,
        status: isPostponed ? "postponed" : "scheduled",
        statusLabel: isPostponed ? "延期" : undefined,
        round,
        // 月ラベルはURLではなくページ内の実日付から作る（URLと中身のズレを防ぐ）
        month: monthLabel(currentDate, now),
        sourceUrl: url,
      });
      unparsedGameRows--;
    });

    source.count = matches.length;
    // 「日程だけ決まっていて対戦カードが未定」のページ（54th_schedule_march.htm など）は
    // 対戦カードらしき行が存在しないので警告しない。
    // 対戦カードらしき行があるのに1件も解釈できなかった場合だけ構造変更を疑う。
    if (matches.length === 0 && unparsedGameRows > 0) {
      source.error = `対戦カードらしき行が${unparsedGameRows}件あるが解釈できない（構造変更の可能性）`;
    }
  } catch (e) {
    source.error = e instanceof Error ? e.message : String(e);
    console.error(`Failed to fetch/parse ${url}:`, e);
  }

  return { matches, source };
}

function dateToMs(date: string, time: string): number {
  const [y, m, d] = date.split("/").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

/** 全取得対象を並列に取得し、日時順に整列して返す */
export async function fetchAllMatches(
  opts: { noStore?: boolean; now?: Date } = {}
): Promise<ScheduleResult> {
  const now = opts.now ?? new Date();
  const results = await Promise.all(
    buildScheduleSources(now).map(({ label, url }) =>
      fetchAndParseSchedule(label, url, { ...opts, now })
    )
  );

  // 同一試合が複数ファイルに載っていても1件に寄せる
  const seen = new Set<string>();
  const matches: Match[] = [];
  for (const { matches: found } of results) {
    for (const m of found) {
      const key = `${m.date}|${m.timeStart}|${m.awayTeam}|${m.homeTeam}|${m.division}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(m);
    }
  }

  matches.sort((a, b) => dateToMs(a.date, a.timeStart) - dateToMs(b.date, b.timeStart));

  return {
    matches,
    sources: results.map((r) => r.source),
    fetchedAt: new Date().toISOString(),
  };
}
