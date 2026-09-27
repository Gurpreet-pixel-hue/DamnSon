import type { NextConfig } from "next";

/**
 * Conservative security headers (§12.1, PL-6).
 *
 * Deliberately no Content-Security-Policy: React Three Fiber compiles shaders and Next injects inline
 * bootstrap scripts, so a CSP tight enough to be worth having would need testing time we do not have
 * before the demo. The headers below cannot break rendering.
 */
const securityHeaders = [
  // Stop a browser guessing a JSON error body is HTML and running it.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the origin to other sites, never the full path: a journey URL carries the citizen's facts.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs any of these; denying them shrinks what an injected script could reach.
  {
    key: "Permissions-Policy",
    value: "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  },
  // CivicWeave is never meant to be framed, and an admin screen in an iframe is a clickjacking target.
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
