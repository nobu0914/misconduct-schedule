import type { Metadata } from "next";
import Link from "next/link";
import "../globals.css";
import PageTracker from "@/components/PageTracker";
import SiteSwitcher from "@/components/SiteSwitcher";
import { eventsBase } from "@/lib/eventsBase";

// events.rinnavi.com:「ジャンプインホッケー」。MHL 以外の練習会・イベントの告知サイト（ユーザー指示 10/7。名前はドメインと別に改名）。
// MHL のサイトとはヘッダー・色・OGP を分ける（中身のコード・KV・管理画面は共有）。

export const metadata: Metadata = {
  metadataBase: new URL("https://events.rinnavi.com"),
  title: "ジャンプインホッケー - Rinnavi",
  description: "ホッケーの練習会・体験会・大会などのお知らせ。申込は各イベントのフォームから。",
  openGraph: {
    title: "ジャンプインホッケー - Rinnavi",
    description: "ホッケーの練習会・体験会・大会などのお知らせ。",
    url: "https://events.rinnavi.com",
    siteName: "Rinnavi ジャンプインホッケー",
    type: "website",
  },
  alternates: { canonical: "https://events.rinnavi.com/" },
};

export default async function EventsLayout({ children }: { children: React.ReactNode }) {
  const base = await eventsBase();
  return (
    <html lang="ja">
      <body className="bg-gray-950 text-white min-h-screen flex flex-col">
        <SiteSwitcher current="events" />
        <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <Link href={base || "/"} className="flex items-center gap-3" data-feature="events > ヘッダー > トップ">
              <span className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0" aria-hidden>
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                  <path d="M10 4 L10 22 Q10 26 14 26 L21 26" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="24" cy="11" r="4" fill="white" />
                </svg>
              </span>
              <span>
                <span className="block text-lg font-bold leading-tight">ジャンプインホッケー</span>
                <span className="block text-[11px] text-gray-400">Rinnavi ・ ホッケーの練習会・体験会・大会のお知らせ</span>
              </span>
            </Link>
          </div>
        </header>
        <PageTracker prefix="/ev" />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-gray-800 mt-10">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-2 text-[11px] text-gray-500 leading-relaxed">
            <p>掲載しているイベントの内容・申込・お問い合わせは、各イベントの主催者へお願いします（申込は各イベントのフォームから）。</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <a href="https://mhlcxc.rinnavi.com" className="text-gray-400 underline underline-offset-2">
                MHL / CxC のスケジュール・データ（Rinnavi）
              </a>
              <a href="https://mhlcxc.rinnavi.com/contact" className="text-gray-400 underline underline-offset-2">
                掲載のご相談・お問い合わせ
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
