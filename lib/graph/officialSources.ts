/**
 * Vetted exception list of official hostnames that do not use the standard
 * .gov.in or .nic.in domain suffixes.
 *
 * Add a host only after manually confirming a government body runs it.
 */
export const VETTED_OFFICIAL_HOSTS: readonly string[] = [
  // Add a host only after manually confirming a government body runs it.
];

/**
 * Checks whether a given URL is from an official Indian government source.
 * Returns true only for https URLs whose hostname ends in .gov.in or .nic.in
 * with at least one label before the suffix, or is in VETTED_OFFICIAL_HOSTS.
 */
export function isOfficialUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (VETTED_OFFICIAL_HOSTS.includes(hostname)) {
      return true;
    }
    if (hostname.endsWith(".gov.in") && hostname.length > ".gov.in".length) {
      return true;
    }
    if (hostname.endsWith(".nic.in") && hostname.length > ".nic.in".length) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
