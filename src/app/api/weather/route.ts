import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export interface HourlyForecast {
  hour: number;      // 0-23
  weather: string;   // "晴れ", "曇り" etc
  iconUrl: string;
  temp: number;      // 気温（℃）
}

export interface DayForecast {
  date: string;      // "4/5"
  weather: string;   // 日別天気テキスト
  iconUrl: string;
  high: number | null;
  low: number | null;
  hourly: HourlyForecast[];
}

interface WeatherData {
  forecasts: DayForecast[];
  lastUpdated: string;
}

export const revalidate = 3600;

const TENKI_DAILY_URL = "https://tenki.jp/forecast/3/14/4310/11224/";
const TENKI_HOURLY_URL = "https://tenki.jp/forecast/3/14/4310/11224/1hour.html";

export async function GET(): Promise<NextResponse<WeatherData>> {
  const forecasts: DayForecast[] = [];
  const forecastMap: Record<string, DayForecast> = {};

  try {
    // 日別予報と1時間予報を並行取得
    const [dailyRes, hourlyRes] = await Promise.all([
      fetch(TENKI_DAILY_URL, {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 3600 },
      }),
      fetch(TENKI_HOURLY_URL, {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 3600 },
      }),
    ]);

    // === 日別予報（今日・明日 + 10日間） ===
    if (dailyRes.ok) {
      const html = await dailyRes.text();
      const $ = cheerio.load(html);

      // 今日・明日
      $(".date-wrap").each((_, el) => {
        const dateText = $(el).find(".date-box").text();
        const dateMatch = dateText.match(/(\d+)月(\d+)日/);
        if (!dateMatch) return;

        const month = parseInt(dateMatch[1], 10);
        const day = parseInt(dateMatch[2], 10);
        const key = `${month}/${day}`;

        const weatherIcon = $(el).find(".weather-icon img");
        const weather = weatherIcon.attr("alt") ?? "";
        const iconUrl = weatherIcon.attr("src") ?? "";

        const highEl = $(el).find(".high-temp.temp .value");
        const lowEl = $(el).find(".low-temp.temp .value");
        const high = highEl.length ? parseInt(highEl.text(), 10) : null;
        const low = lowEl.length ? parseInt(lowEl.text(), 10) : null;

        const entry: DayForecast = {
          date: key,
          weather,
          iconUrl,
          high: isNaN(high as number) ? null : high,
          low: isNaN(low as number) ? null : low,
          hourly: [],
        };
        forecastMap[key] = entry;
        forecasts.push(entry);
      });

      // 10日間予報
      const weekTable = $(".forecast-point-week.forecast-days-long");
      if (weekTable.length) {
        const dates: string[] = [];
        weekTable.find("tr").eq(0).find(".date-box").each((_, el) => {
          const text = $(el).text();
          const m = text.match(/(\d+)月(\d+)日/);
          if (m) dates.push(`${parseInt(m[1], 10)}/${parseInt(m[2], 10)}`);
        });

        const weathers: string[] = [];
        const iconUrls: string[] = [];
        weekTable.find("th.ships-info").each((_, el) => {
          const label = $(el).text().trim();
          const row = $(el).parent();
          if (label === "天気") {
            row.find("td.weather-icon").each((_, td) => {
              const img = $(td).find("img");
              weathers.push(img.attr("alt") ?? "");
              iconUrls.push(img.attr("src") ?? "");
            });
          }
        });

        const highs: (number | null)[] = [];
        const lows: (number | null)[] = [];
        weekTable.find("tr").each((_, tr) => {
          const firstTh = $(tr).find("th").text().trim();
          if (firstTh.includes("最高")) {
            $(tr).find("td").each((_, td) => {
              const val = $(td).find(".high-temp").text().trim();
              const n = parseInt(val, 10);
              highs.push(isNaN(n) ? null : n);
            });
          }
          if (firstTh.includes("最低")) {
            $(tr).find("td").each((_, td) => {
              const val = $(td).find(".low-temp").text().trim();
              const n = parseInt(val, 10);
              lows.push(isNaN(n) ? null : n);
            });
          }
        });

        for (let i = 0; i < dates.length; i++) {
          const key = dates[i];
          if (forecastMap[key]) continue; // 今日・明日は既に追加済み
          const entry: DayForecast = {
            date: key,
            weather: weathers[i] ?? "",
            iconUrl: iconUrls[i] ?? "",
            high: highs[i] ?? null,
            low: lows[i] ?? null,
            hourly: [],
          };
          forecastMap[key] = entry;
          forecasts.push(entry);
        }
      }
    }

    // === 1時間予報 ===
    if (hourlyRes.ok) {
      const html = await hourlyRes.text();
      const $ = cheerio.load(html);

      $("table.forecast-point-1h").each((_, table) => {
        const dateMatch = $(table).text().match(/(\d{4})年(\d+)月(\d+)日/);
        if (!dateMatch) return;

        const month = parseInt(dateMatch[2], 10);
        const day = parseInt(dateMatch[3], 10);
        const key = `${month}/${day}`;

        const hours: number[] = [];
        $(table).find("tr.hour td span").each((_, el) => {
          const h = parseInt($(el).text(), 10);
          if (!isNaN(h)) hours.push(h === 24 ? 0 : h);
        });

        const weathers: { text: string; icon: string }[] = [];
        $(table).find("tr.weather td").each((_, td) => {
          const img = $(td).find("img");
          weathers.push({
            text: img.attr("alt") ?? "",
            icon: img.attr("src") ?? "",
          });
        });

        const temps: number[] = [];
        $(table).find("tr.temperature td span").each((_, el) => {
          temps.push(parseFloat($(el).text()) || 0);
        });

        const hourlyData: HourlyForecast[] = [];
        for (let i = 0; i < hours.length; i++) {
          hourlyData.push({
            hour: hours[i],
            weather: weathers[i]?.text ?? "",
            iconUrl: weathers[i]?.icon ?? "",
            temp: temps[i] ?? 0,
          });
        }

        // forecastMapに追加
        if (forecastMap[key]) {
          forecastMap[key].hourly = hourlyData;
        } else {
          const entry: DayForecast = {
            date: key,
            weather: "",
            iconUrl: "",
            high: null,
            low: null,
            hourly: hourlyData,
          };
          forecastMap[key] = entry;
          forecasts.push(entry);
        }
      });
    }
  } catch (e) {
    console.error("Failed to fetch weather:", e);
  }

  return NextResponse.json(
    { forecasts, lastUpdated: new Date().toISOString() },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=1800" } }
  );
}
