import { redirect } from "next/navigation";

// スコア表分析はデータページの「分析」タブに移した（古いリンク用）
export default function ScoreSheetPage() {
  redirect("/player-ranking?mode=analysis");
}
