import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export interface EventItem {
  date: string;       // "YYYY/MM/DD"
  dateLabel: string;  // "2026年3月22日"
  title: string;
  excerpt: string;
  url: string;
  isNew: boolean;     // posted within 7 days
}

interface EventsData {
  items: EventItem[];
  lastUpdated: string;
  hasNew: boolean;
}

const MONTH_MAP: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

async function fetchPage(url: string): Promise<EventItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 1800 },
  });
  if (!res.ok) return [];

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

    const postDate = new Date(year, month - 1, day);
    const diffDays = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24);
    const isNew = diffDays <= 7;

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

export async function GET(): Promise<NextResponse<EventsData>> {
  const allItems: EventItem[] = [];

  // Fetch page 1 and 2 to get recent news
  const [page1, page2] = await Promise.all([
    fetchPage("https://misconduct.co.jp/news/"),
    fetchPage("https://misconduct.co.jp/news/page/2/"),
  ]);

  allItems.push(...page1, ...page2);

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const hasNew = unique.some((item) => item.isNew);

  return NextResponse.json({
    items: unique,
    lastUpdated: new Date().toISOString(),
    hasNew,
  });
}
