/**
 * The "Ask about this step" box is shown only when the intelligence service is configured
 * (PRD §6.6). With no service, /api/v1/copilot can only answer 503, so the box stays hidden
 * instead of showing a feature that cannot work.
 */
export function isCopilotEnabled(intelligenceBaseUrl: string | undefined): boolean {
  if (intelligenceBaseUrl === undefined) return false;
  const trimmed = intelligenceBaseUrl.trim();
  if (trimmed.length === 0) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
