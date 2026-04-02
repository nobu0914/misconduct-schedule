import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "バージョン履歴 - Rinnavi MHL/CxC",
};

const VERSIONS = [
  {
    version: "Ver.1-260402-1320",
    date: "2026-04-02",
    changes: [
      "タブ名を「ゲーム情報」に変更",
      "一覧のポイント（pt）表示を削除",
      "カードにAway/Homeラベルを追加",
      "チーム名から(A)等の記号を削除し、カード内に「ベンチ: X」として表示",
      "ランキング変動矢印（↑↓）を追加（前回比較、Vercel KV使用）",
      "検索条件お気に入り登録機能を追加（★ボタン、ローカル保存）",
      "バージョン履歴ページを追加",
      "スケジュール取得頻度を24時間に変更",
      "レンタル情報取得頻度を3日に変更",
      "イベント情報取得頻度を24時間に変更",
      "水曜練習会の練習メニュー「ゲーム形式」を「ゲームを想定した練習」に変更",
    ],
  },
  {
    version: "Ver.1-260402-0106",
    date: "2026-04-02",
    changes: [
      "ランキングにW（勝）/ L（負）/ T（引き分け）を追加",
      "モーダルに得点上位3名の背番号を表示",
      "ランキング比較モーダルを実装（カードタップで表示）",
      "順位表示を「順位（試合数）」形式に変更",
      "勝敗とptを同列に並べて表示",
      "チーム名の大文字小文字を無視してランキング照合",
    ],
  },
  {
    version: "Ver.1-260331-2100",
    date: "2026-03-31",
    changes: [
      "ゲームスケジュールにランキング（順位・勝ち点）を表示",
      "standings API 追加（53シーズン各ディビジョン対応）",
      "UTF-16 LE BOM 自動検出・デコード対応",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">バージョン履歴</h1>
      <div className="space-y-6">
        {VERSIONS.map((v) => (
          <div key={v.version} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-blue-400 font-mono font-semibold">{v.version}</span>
              <span className="text-gray-500 text-sm">{v.date}</span>
            </div>
            <ul className="space-y-1.5">
              {v.changes.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-gray-600 mt-0.5 flex-shrink-0">•</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
