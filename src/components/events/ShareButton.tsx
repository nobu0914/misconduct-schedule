"use client";

import { useState } from "react";

/** このイベントのページを共有（共有シートが無ければリンクをコピー）。どこで見ていても events.rinnavi.com のアドレスを渡す */
export default function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(`${title}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("このリンクをコピーしてください", url);
    }
  }
  return (
    <button
      onClick={share}
      data-feature={`events > 共有 > ${title}`}
      className={`w-full py-2.5 rounded-lg text-sm font-medium border ${
        copied ? "bg-green-600 border-green-600 text-white" : "bg-gray-800 border-gray-700 text-gray-200"
      }`}
    >
      {copied ? "リンクをコピーしました" : "🔗 このイベントを共有"}
    </button>
  );
}
