// docs/ppt-assets/capture.mjs — screenshots for the slide deck, from the running app.
// Usage:  DATA_SOURCE=files npm run dev    then:  node docs/ppt-assets/capture.mjs
// Override the target with BASE_URL=https://… to capture a deployment instead.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = join(process.cwd(), "docs", "ppt-assets", "screenshots");
const SHOTS = [
  { file: "01-landing.png", path: "/" },
  { file: "02-journey-3d.png", path: "/journey/start-business-mumbai" },
  { file: "13-municipal-journey.png", path: "/journey/new-water-connection-mumbai" },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });

for (const shot of SHOTS) {
  try {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    // Let the 3D scene settle; it loads lazily.
    await page.waitForTimeout(4_000);
    await page.screenshot({ path: join(OUT, shot.file) });
    console.log(`captured ${shot.file}  ${shot.path}`);
  } catch (error) {
    console.error(`skipped ${shot.file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await browser.close();
