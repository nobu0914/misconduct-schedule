export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* 更新日時プレースホルダー */}
      <div className="max-w-5xl mx-auto px-4 pt-2 text-right">
        <div className="h-4 w-40 bg-gray-800 rounded animate-pulse ml-auto" />
      </div>

      {/* フィルターエリア */}
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-3">
        <div className="h-10 bg-gray-800 rounded-lg animate-pulse" />
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-800 rounded-lg animate-pulse" />
          <div className="h-8 w-32 bg-gray-800 rounded-lg animate-pulse" />
          <div className="h-8 w-16 bg-gray-800 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* スケジュールカード */}
      <main className="max-w-5xl mx-auto px-4 pb-12">
        {[1, 2, 3].map((group) => (
          <div key={group} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-6 w-48 bg-gray-800 rounded animate-pulse" />
              <div className="flex-1 h-px bg-gray-800" />
            </div>
            <div className="space-y-2">
              {[1, 2].map((card) => (
                <div key={card} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-16 bg-gray-800 rounded animate-pulse" />
                    <div className="flex-1 flex items-center gap-2">
                      <div className="h-5 w-28 bg-gray-800 rounded animate-pulse" />
                      <span className="text-gray-700 text-sm">vs</span>
                      <div className="h-5 w-28 bg-gray-800 rounded animate-pulse" />
                    </div>
                    <div className="h-6 w-16 bg-gray-800 rounded-full animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
