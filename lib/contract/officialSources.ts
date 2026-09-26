/** Add a host only after manually confirming that a government body runs it. */
export const VETTED_OFFICIAL_HOSTS: readonly string[] = [];

export function isOfficialUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (VETTED_OFFICIAL_HOSTS.includes(host)) return true;
  return [".gov.in", ".nic.in"].some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}
