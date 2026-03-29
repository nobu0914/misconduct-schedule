"use client";

interface Props {
  pulling: boolean;
  refreshing: boolean;
  pullDistance: number;
  threshold: number;
}

export default function PullToRefreshIndicator({ pulling, refreshing, pullDistance, threshold }: Props) {
  const progress = Math.min(pullDistance / threshold, 1);
  const ready = progress >= 1;

  if (!pulling && !refreshing) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 flex justify-center z-50 pointer-events-none transition-all"
      style={{ paddingTop: refreshing ? "60px" : `${pullDistance * 0.5}px` }}
    >
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium shadow-lg transition-colors ${
        refreshing ? "bg-blue-600 text-white" : ready ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-300"
      }`}>
        {refreshing ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            更新中...
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4 transition-transform duration-200"
              style={{ transform: `rotate(${ready ? 180 : progress * 180}deg)` }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {ready ? "離して更新" : "引いて更新"}
          </>
        )}
      </div>
    </div>
  );
}
