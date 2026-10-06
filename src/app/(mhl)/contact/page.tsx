"use client";

import { useState } from "react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-xl mx-auto px-4 py-10">
        <h2 className="text-xl font-bold text-white mb-1">お問い合わせ</h2>
        <p className="text-xs text-gray-500 mb-8">ご意見・ご要望・不具合報告などはこちらからどうぞ。</p>

        {status === "done" ? (
          <div className="bg-green-900/30 border border-green-700 rounded-xl p-6 text-center space-y-2">
            <svg className="w-10 h-10 text-green-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-white font-semibold">送信しました</p>
            <p className="text-sm text-gray-400">お問い合わせありがとうございます。内容を確認次第ご連絡いたします。</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                お名前 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="山田 太郎"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                メールアドレス <span className="text-gray-500 text-xs">（任意・返信希望の場合）</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                メッセージ <span className="text-red-400">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={6}
                placeholder="お問い合わせ内容をご入力ください"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {status === "error" && (
              <p className="text-red-400 text-sm">送信に失敗しました。しばらくしてから再度お試しください。</p>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold transition-colors"
            >
              {status === "submitting" ? "送信中..." : "送信する"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
