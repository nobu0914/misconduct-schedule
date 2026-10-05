"use client";

// イベント・プログラムの概要モーダル（ゲーム情報・リンク予定で共通）。概要を見てから公式サイトへ進める
import type { ProgramEntry } from "@/lib/events";

const ExternalIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

export default function ProgramModal({
  program,
  scheduleUrl,
  onClose,
}: {
  program: ProgramEntry;
  /** 公式のリンク予定表（レンタル枠の掲載ページ）。あれば2つ目の動線として出す */
  scheduleUrl?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-label={program.name}
        className="relative w-full sm:max-w-md bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-700 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">イベント</span>
            <span className="text-gray-400 text-xs">{program.dateTime}</span>
          </div>
          <button onClick={onClose} aria-label="閉じる" className="text-gray-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-3">
          <h3 className="text-white font-bold text-lg">{program.name}</h3>
          {program.description && <p className="text-gray-300 text-sm leading-relaxed">{program.description.replace(/^※/, "")}</p>}
          <div className="pt-2 space-y-2">
            <a
              href={program.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-feature={`イベント概要 > 公式サイトを開く > ${program.name}`}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium"
            >
              公式サイトで詳しく見る
              <ExternalIcon />
            </a>
            {scheduleUrl && (
              <a
                href={scheduleUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-feature="イベント概要 > 公式のリンク予定表を開く"
                className="flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-200"
              >
                公式のリンク予定表を開く
                <ExternalIcon />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
