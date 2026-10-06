import { ImageResponse } from "next/og";
import { japaneseFont } from "@/lib/ogFont";

// events.rinnavi.com の OGP 画像（LINE などで共有したときのサムネイル）。日本語はフォントを取れたときだけ
export const OG_SIZE = { width: 1200, height: 630 };

export async function eventsOgImage(lines: { title?: string; sub?: string; badge?: string }) {
  const jp = [lines.title, lines.sub, lines.badge].filter(Boolean).join("");
  const font = jp ? await japaneseFont(`${jp}Rinnavi Events`) : undefined;
  const useJp = !!font;
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#030712", color: "white", fontFamily: useJp ? "NotoJP" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 96, height: 96, background: "#059669", borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
              <path d="M10 4 L10 22 Q10 26 14 26 L21 26" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="11" r="4" fill="white" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>Rinnavi Events</div>
        </div>
        {useJp && lines.title ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {lines.badge && (
              <div style={{ display: "flex" }}>
                <div style={{ display: "flex", fontSize: 30, padding: "6px 18px", borderRadius: 12, background: "#064e3b", color: "#a7f3d0" }}>{lines.badge}</div>
              </div>
            )}
            <div style={{ display: "flex", fontSize: lines.title.length > 22 ? 56 : 68, fontWeight: 700, lineHeight: 1.25 }}>{lines.title}</div>
            {lines.sub && <div style={{ display: "flex", fontSize: 36, color: "#9ca3af" }}>{lines.sub}</div>}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 700 }}>Hockey Events</div>
            <div style={{ display: "flex", fontSize: 36, color: "#9ca3af" }}>Practice · Clinics · Tournaments</div>
          </div>
        )}
        <div style={{ display: "flex", fontSize: 28, color: "#6ee7b7" }}>events.rinnavi.com</div>
      </div>
    ),
    { ...OG_SIZE, fonts: font ? [{ name: "NotoJP", data: font, weight: 700, style: "normal" }] : undefined }
  );
}
