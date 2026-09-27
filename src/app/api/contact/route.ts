import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

const LIMITS = { name: 100, email: 200, message: 5000 };

function trimmed(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("contact POST: RESEND_API_KEY is not set");
    return NextResponse.json({ error: "送信設定が未完了です" }, { status: 500 });
  }

  // 送信先は運営者の個人メールなので、同一IPからの連投を制限する
  if (await isRateLimited(`contact:${clientIp(req)}`, 5, 3600)) {
    return NextResponse.json(
      { error: "送信が多すぎます。しばらく待ってからお試しください。" },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = trimmed(body.name, LIMITS.name);
  const email = trimmed(body.email, LIMITS.email);
  const message = trimmed(body.message, LIMITS.message);

  if (!name || !message) {
    return NextResponse.json({ error: "必須項目が未入力です" }, { status: 400 });
  }

  try {
    // モジュール読み込み時ではなくここで生成する（キー未設定でもビルドが通る）
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "MHL/CXC お問い合わせ <onboarding@resend.dev>",
      to: "kijiatora.regi@gmail.com",
      subject: `【お問い合わせ】${name} 様より`,
      text: [
        `お名前: ${name}`,
        `メールアドレス: ${email || "未入力"}`,
        "",
        "--- メッセージ ---",
        message,
      ].join("\n"),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    // 送信サービスのエラー詳細はログにだけ残す
    console.error("contact POST error:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "送信に失敗しました。時間をおいてお試しください。" }, { status: 500 });
  }
}
