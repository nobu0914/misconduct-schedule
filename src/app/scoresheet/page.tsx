import type { Metadata } from "next";
import ScoreSheetApp from "@/components/ScoreSheetApp";

export const metadata: Metadata = {
  title: "スコア表分析 - Rinnavi MHL/CxC",
  description: "試合のスコア表を登録して、セーブ率・決定率・パワープレー得点などを分析します。",
};

export default function ScoreSheetPage() {
  return <ScoreSheetApp />;
}
