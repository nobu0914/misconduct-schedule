import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#2563eb",
          borderRadius: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32" fill="none">
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
    ),
    { ...size }
  );
}
