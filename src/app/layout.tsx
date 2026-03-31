import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import SwipeNavigation from "@/components/SwipeNavigation";

export const metadata: Metadata = {
  title: "Rinnavi - MHL / CxC",
  description: "AIでホッケー情報を集めるサイト Rinnavi",
  openGraph: {
    description: "AIでホッケー情報を集めるサイト Rinnavi",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-950 text-white min-h-screen">
        <Nav />
        <SwipeNavigation />
        {children}
      </body>
    </html>
  );
}
