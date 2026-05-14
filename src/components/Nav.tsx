"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function Nav() {
  const pathname = usePathname();
  const [hasNewEvents, setHasNewEvents] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => setHasNewEvents(data.hasNew ?? false))
      .catch(() => {});
  }, []);

  // メニュー外クリックで閉じる
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const links = [
    { href: "/", label: "ゲーム情報", badge: false },
    { href: "/player-ranking", label: "ランク", badge: false },
    { href: "/rental", label: "リンク予定", badge: false },
    { href: "/events", label: "イベント", badge: hasNewEvents },
  ];

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-blue-600 rounded-lg p-2">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">MHL / CXC</h1>
            <p className="text-xs text-gray-400">公式サイトの情報を自動表示している非公式ツールです。</p>
          </div>

          {/* ハンバーガーボタン */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              aria-label="メニュー"
            >
              {menuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>

            {/* ドロップダウン */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
                <a
                  href="https://mhlcxc.rinnavi.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  MHL / CXC
                </a>

                <div className="border-t border-gray-700" />

                <Link
                  href="/contact"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  お問い合わせ
                </Link>

                <Link
                  href="/changelog"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  バージョン履歴
                </Link>

                <div className="border-t border-gray-700" />

                <button
                  onClick={async () => {
                    const shareData = {
                      title: "Rinnavi - MHL / CxC",
                      text: "MHL/CxCのスケジュール・レンタル情報をまとめたサイト",
                      url: "https://mhlcxc.rinnavi.com",
                    };
                    if (navigator.share) {
                      try {
                        await navigator.share(shareData);
                        setMenuOpen(false);
                      } catch {}
                    } else {
                      await navigator.clipboard.writeText(shareData.url);
                      setShareCopied(true);
                      setTimeout(() => { setShareCopied(false); setMenuOpen(false); }, 1500);
                    }
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  {shareCopied ? (
                    <>
                      <svg className="w-4 h-4 flex-shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-green-400">URLをコピーしました</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      サイトを共有
                    </>
                  )}
                </button>

                <div className="border-t border-gray-700" />

                <Link
                  href="/disclaimer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  免責事項
                </Link>

                <div className="border-t border-gray-700" />
                <div className="px-4 py-2 text-xs text-gray-600 text-center">Ver.1-260406-0000</div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex">
          {links.map(({ href, label, badge }) => (
            <Link
              key={href}
              href={href}
              className={`relative flex-1 text-center py-2 text-sm font-medium transition-colors border-b-2 ${
                pathname === href
                  ? "border-blue-500 text-white"
                  : "border-transparent text-gray-400 hover:text-white hover:border-gray-600"
              }`}
            >
              {label}
              {badge && (
                <span className="absolute top-1 right-3 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
