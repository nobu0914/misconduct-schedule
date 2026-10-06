// OGP 画像（next/og）で日本語を出すためのフォント。標準のフォントでは日本語が豆腐になるので、
// 使う文字だけを Google Fonts から取る（text= で絞ると小さい）。取れなければ undefined（呼ぶ側で英字だけにする）
export async function japaneseFont(text: string, weight = 700): Promise<ArrayBuffer | undefined> {
  try {
    const chars = [...new Set(text)].join("");
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(chars)}`, {
      signal: AbortSignal.timeout(4000),
    }).then((r) => (r.ok ? r.text() : ""));
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return undefined;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.ok ? await res.arrayBuffer() : undefined;
  } catch {
    return undefined;
  }
}
