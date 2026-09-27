import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Rinnavi - MHL / CxC";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          background: "#030712",
          color: "white",
        }}
      >
        <div
          style={{
            width: 200,
            height: 200,
            background: "#2563eb",
            borderRadius: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="132" height="132" viewBox="0 0 32 32" fill="none">
            {/* Hockey stick */}
            <path
              d="M10 4 L10 22 Q10 26 14 26 L21 26"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Puck */}
            <circle cx="24" cy="11" r="4" fill="white" />
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 700 }}>
          Rinnavi
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 44,
            letterSpacing: 10,
            color: "#93c5fd",
          }}
        >
          MHL / CxC
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#9ca3af" }}>
          Hockey Schedule · Standings · Rink Rental
        </div>
      </div>
    ),
    { ...size }
  );
}
