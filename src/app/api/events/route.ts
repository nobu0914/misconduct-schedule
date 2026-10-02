import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { loadArchive, saveArchive } from "@/lib/archive";

export interface ProgramEntry {
  dateTime: string;   // "4月4日(土) 9:00-11:00"
  name: string;       // "Saturday Pick Up Hockey"
  description: string; // "※どなたでもご参加いただける..."
  sourceUrl: string;  // 掲載元の公式ニュースURL
}

export interface EventItem {
  date: string;       // "YYYY/MM/DD"
  dateLabel: string;  // "2026年3月22日"
  title: string;
  excerpt: string;
  url: string;
  isNew: boolean;     // posted within 7 days
  programs?: ProgramEntry[]; // イベント・プログラム紹介記事の場合のみ
}

interface EventsData {
  items: EventItem[];
  lastUpdated: string;
  hasNew: boolean;
  /** 公式サイトから取れず保存データで返したとき、その保存時刻 */
  fromArchive?: string;
}

// 公式サイトに届かない日（ビルド時の事前生成を含む）は、前回取れたお知らせを KV から返す
const ARCHIVE_GROUP = "events";
const ARCHIVE_LABEL = "news";

const NEW_WITHIN_DAYS = 7;

function isRecent(date: string, now: Date): boolean {
  const [y, m, d] = date.split("/").map(Number);
  const diffDays = (now.getTime() - new Date(y, m - 1, d).getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= NEW_WITHIN_DAYS;
}

// 他の取得系APIと同じく1日キャッシュ。内部 fetch の revalidate と同じ値にする
export const revalidate = 86400;

const MONTH_MAP: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/** 取得できなかった（接続エラー・HTTPエラー）ときは null */
async function fetchPage(url: string): Promise<EventItem[] | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 86400 },
    });
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e);
    return null;
  }
  if (!res.ok) return null;

  const text = await res.text();
  const $ = cheerio.load(text);
  const items: EventItem[] = [];
  const now = new Date();

  $("li.clearfix").each((_: number, li: any) => {
    const yearText = $(li).find(".post_date_year").text().trim();
    const monthDayText = $(li).find(".post_date_month").text().trim();
    // monthDayText is like "22Mar" or "5Jan"
    const monthMatch = monthDayText.match(/^(\d+)([A-Za-z]+)$/);
    if (!yearText || !monthMatch) return;

    const year = parseInt(yearText, 10);
    const day = parseInt(monthMatch[1], 10);
    const monthStr = monthMatch[2];
    const month = MONTH_MAP[monthStr] ?? MONTH_MAP[monthStr.charAt(0).toUpperCase() + monthStr.slice(1).toLowerCase()];
    if (!month) return;

    const isNew = isRecent(`${year}/${month}/${day}`, now);

    const titleEl = $(li).find(".post_title a");
    const title = titleEl.text().trim();
    const articleUrl = titleEl.attr("href") ?? "";

    const excerptEl = $(li).find(".news_info p a");
    const excerpt = excerptEl.text().trim().replace(/\s+/g, " ");

    if (!title) return;

    items.push({
      date: `${year}/${month}/${day}`,
      dateLabel: `${year}年${month}月${day}日`,
      title,
      excerpt,
      url: articleUrl,
      isNew,
    });
  });

  return items;
}

function cleanHtmlText(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\u00a0/g, " ")
    .trim();
}

async function fetchProgramDetail(url: string): Promise<ProgramEntry[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const contentEl = $(".post_content");
    if (!contentEl.length) return [];

    // Get inner HTML, split by <br> and <p> tags
    const rawHtml = contentEl.html() ?? "";
    const lines = rawHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<p[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map(cleanHtmlText)
      .filter(Boolean);

    const programs: ProgramEntry[] = [];
    // Pattern: lines starting with ・ are event headers, next line starting with ※ is description
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("・")) continue;

      // Parse: ・4月4日(土)　9:00-11:00　Saturday Pick Up Hockey
      const content = line.slice(1).trim();
      // Split by datetime pattern
      const m = content.match(/^(.+?\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\s+(.+)$/);
      if (!m) continue;

      const dateTime = m[1].replace(/\s+/g, " ").trim();
      const name = m[2].trim();

      // Collect description lines (starting with ※)
      let description = "";
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith("※")) {
          description += (description ? " " : "") + lines[j];
        } else {
          break;
        }
      }

      programs.push({ dateTime, name, description, sourceUrl: url });
    }

    return programs;
  } catch {
    return [];
  }
}

export async function GET(): Promise<NextResponse<EventsData>> {
  const allItems: EventItem[] = [];

  // Fetch page 1 and 2 to get recent news
  const [page1, page2] = await Promise.all([
    fetchPage("https://misconduct.co.jp/news/"),
    fetchPage("https://misconduct.co.jp/news/page/2/"),
  ]);

  // 1ページ目が取れないときは保存データで返す（空で上書きしない）
  if (page1 === null) {
    const now = new Date();
    const snapshot = await loadArchive<EventItem>(ARCHIVE_GROUP, ARCHIVE_LABEL);
    const items = (snapshot?.items ?? []).map((item) => ({ ...item, isNew: isRecent(item.date, now) }));
    return NextResponse.json({
      items,
      lastUpdated: snapshot?.savedAt ?? now.toISOString(),
      hasNew: items.some((item) => item.isNew),
      ...(snapshot ? { fromArchive: snapshot.savedAt } : {}),
    });
  }

  allItems.push(...page1, ...(page2 ?? []));

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  // イベント・プログラム紹介記事の詳細を取得
  const programItems = unique.filter((item) => item.title.includes("イベント・プログラム"));
  await Promise.all(
    programItems.map(async (item) => {
      item.programs = await fetchProgramDetail(item.url);
    })
  );

  const hasNew = unique.some((item) => item.isNew);

  // 取れた分を保存しておく（公式に届かない日の表示用。空なら上書きしない）
  await saveArchive(ARCHIVE_GROUP, ARCHIVE_LABEL, unique);

  return NextResponse.json({
    items: unique,
    lastUpdated: new Date().toISOString(),
    hasNew,
  });
}
