// イベントのページのリンクの頭。events.rinnavi.com では ""、MHL のアドレス（/ev）で見ているときは "/ev"。
// iPhone のホーム画面から開いた MHL（Web アプリ）は、別のドメインへ移ると OS のブラウザ画面（×・アドレス・下のバー）が
// かぶさるので、そのときは同じドメインの /ev でイベントのページを出す（ユーザー指示 10/7「この OS UI が出ないように」）。
import { headers } from "next/headers";

export const EVENTS_ORIGIN = "https://events.rinnavi.com";

export async function eventsBase(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  return host.startsWith("events.") ? "" : "/ev";
}
