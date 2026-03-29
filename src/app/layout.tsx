import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MHL Schedule - Misconduct Hockey League",
  description: "Misconduct Hockey League 試合スケジュール",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-950 text-white min-h-screen">{children}</body>
    </html>
  );
}
