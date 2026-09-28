import { ImageResponse } from "next/og";
import { getJourneyRepository } from "@/lib/server/journeys";
import { loadJourneyPage } from "./loadJourneyPage";

export const runtime = "nodejs";
export const alt = "CivicWeave Journey";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const repo = getJourneyRepository();
  const [res, templates] = await Promise.all([
    loadJourneyPage(repo, taskId),
    repo.listTemplates(),
  ]);

  if (res.kind !== "ok") {
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

  const summary = templates.find((t) => t.taskId === taskId);
  const title = res.data.published.template.title;
  const stepCount = summary?.stepCount ?? res.data.published.journey.steps.length;
  const verifiedCount = summary?.verifiedStepCount ?? 0;
  const jurisdiction = res.data.published.template.jurisdiction.city
    ? `${res.data.published.template.jurisdiction.city}, ${res.data.published.template.jurisdiction.state}`
    : res.data.published.template.jurisdiction.state;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#FBFBFA",
          color: "#121316",
          padding: 80,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
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
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#121316",
              }}
            >
              CivicWeave
            </span>
          </div>

          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#6B7280",
              backgroundColor: "rgba(0,0,0,0.05)",
              padding: "6px 14px",
              borderRadius: 8,
            }}
          >
            {jurisdiction}
          </span>
        </div>

        {/* Journey Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <h1
            style={{
              fontSize: 54,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "#121316",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: 26,
              fontWeight: 600,
              color: "#0F4C81",
              margin: 0,
            }}
          >
            {stepCount} steps &middot; {verifiedCount} of {stepCount} verified
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(0,0,0,0.1)",
            paddingTop: 24,
          }}
        >
          <span
            style={{
              fontSize: 18,
              color: "#6B7280",
              fontWeight: 500,
            }}
          >
            Your city. In order.
          </span>
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#1E7F3B",
            }}
          >
            Official government procedures verified
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
