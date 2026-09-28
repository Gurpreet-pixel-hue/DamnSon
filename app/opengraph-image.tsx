import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "CivicWeave · Your city. In order.";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FBFBFA",
          color: "#121316",
          padding: 80,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 40,
          }}
        >
          <svg width="80" height="80" viewBox="0 0 32 32" fill="none">
            <path
              d="M4 8h24M8 16h20M4 24h24"
              stroke="#0F4C81"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M12 4v24M20 4v24"
              stroke="#1E7F3B"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: "#121316",
            }}
          >
            CivicWeave
          </span>
        </div>

        <p
          style={{
            fontSize: 32,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: "#6B7280",
            margin: 0,
            marginBottom: 20,
          }}
        >
          Your city. In order.
        </p>

        <p
          style={{
            fontSize: 22,
            color: "#4B5563",
            margin: 0,
            maxWidth: 700,
            textAlign: "center",
          }}
        >
          Municipal bureaucracy and civic procedure path visualizer.
        </p>
      </div>
    ),
    {
      ...size,
    }
  );
}
