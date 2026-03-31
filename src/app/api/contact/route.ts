import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { name, email, message } = await req.json() as {
    name: string;
    email: string;
    message: string;
  };

  if (!name || !message) {
    return NextResponse.json({ error: "必須項目が未入力です" }, { status: 400 });
  }

  try {
    await resend.emails.send({
      from: "MHL/CXC お問い合わせ <onboarding@resend.dev>",
      to: "kijiatora.regi4@gmail.com",
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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("contact POST error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
