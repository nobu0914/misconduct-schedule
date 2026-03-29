"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "ゲームスケジュール" },
    { href: "/rental", label: "レンタル情報" },
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
          <div>
            <h1 className="text-xl font-bold text-white">MHL / CXC API</h1>
            <p className="text-xs text-gray-400">公式サイトの情報を自動表示している非公式ツールです。</p>
          </div>
        </div>

        <nav className="flex gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === href
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
