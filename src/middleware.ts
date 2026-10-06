import { NextRequest, NextResponse } from "next/server";

// 1つのプロジェクトで2つのサイトを出す（ユーザー指示 10/7）:
// - events.rinnavi.com（ローカルは events.localhost）→ イベント・練習会の告知サイト（src/app/(events)/ev）
// - それ以外（mhlcxc.rinnavi.com など）→ 今までの MHL サイト（src/app/(mhl)）
// イベントのサイトでは /e/abc を /ev/e/abc に読み替える。MHL のアドレスの /ev でもイベントのページを出す
// （iPhone のホーム画面の Web アプリは別ドメインへ移ると OS のブラウザ画面がかぶさるため。正しいアドレスは canonical で events 側）。

const isEventsHost = (host: string) => host.startsWith("events.");

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname } = req.nextUrl;
  const evPath = pathname === "/ev" || pathname.startsWith("/ev/");
  if (isEventsHost(host)) {
    // OGP 画像など、Next が /ev の付いたアドレスを出すものはそのまま
    if (evPath) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/ev" : `/ev${pathname}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  // API・Next の内部ファイル・アイコンなど（ドットを含むもの）は通さない
  matcher: ["/((?!api/|_next/|apple-icon|icon\\.svg|favicon\\.ico|.*\\.[a-z0-9]+$).*)"],
};
