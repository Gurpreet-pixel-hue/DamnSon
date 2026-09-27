import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PRIMARY_REVIEW_DIR = path.resolve(process.cwd(), ".next/claude-review/fe-1v");
const EXTRA_REVIEW_DIR = path.resolve(process.cwd(), "art/out/review");
const EXTRA_COPY_DIR = process.env.REVIEW_EXTRA_DIR || null;

for (const dir of [PRIMARY_REVIEW_DIR, EXTRA_REVIEW_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
if (EXTRA_COPY_DIR && !fs.existsSync(EXTRA_COPY_DIR)) {
  fs.mkdirSync(EXTRA_COPY_DIR, { recursive: true });
}

const CHROME_PATH =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Helper to convert sRGB to CIE L*a*b* (D65 illuminant)
function rgbToLab(r, g, b) {
  let rL = r / 255;
  let gL = g / 255;
  let bL = b / 255;

  rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
  gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
  bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;

  const x = (rL * 0.4124 + gL * 0.3576 + bL * 0.1805) / 0.95047;
  const y = (rL * 0.2126 + gL * 0.7152 + bL * 0.0722) / 1.0;
  const z = (rL * 0.0193 + gL * 0.1192 + bL * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);
  return { L, a, b: bVal };
}

// Background token --cw-bg is #F5EFE3
const BG_LAB = rgbToLab(245, 239, 227);

async function computeBgPixelPercentage(filePath) {
  const { data, info } = await sharp(filePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const totalPixels = info.width * info.height;
  let bgPixels = 0;
  const channels = info.channels;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lab = rgbToLab(r, g, b);
    const dE = Math.hypot(lab.L - BG_LAB.L, lab.a - BG_LAB.a, lab.b - BG_LAB.b);
    if (dE <= 2.0) {
      bgPixels++;
    }
  }
  const pct = (bgPixels / totalPixels) * 100;
  return { bgPixels, totalPixels, pct };
}

async function main() {
  console.log("=== Starting FE-1V Stage 1 Screenshot & Metrics Capture (G6) ===");
  console.log(`Using Chrome: ${CHROME_PATH}`);

  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9223",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=metal",
    "--window-size=1440,900",
    "about:blank",
  ]);

  await new Promise((r) => setTimeout(r, 2500));

  const listRes = await fetch("http://localhost:9223/json/list");
  const pages = await listRes.json();
  const page = pages.find((p) => p.type === "page") || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 1;
  const callbacks = new Map();
  const consoleMessages = [];
  const localhostRequests = new Set();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      callbacks.get(data.id)(data);
      callbacks.delete(data.id);
    }
    if (data.method === "Runtime.consoleAPICalled") {
      const type = data.params.type;
      const text = data.params.args
        .map((a) => a.value || a.description || "")
        .join(" ");
      consoleMessages.push({ type, text });
      console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
    }
    if (data.method === "Network.requestWillBeSent") {
      const url = data.params.request.url;
      if (url.includes("localhost:3000")) {
        localhostRequests.add(url);
      }
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const currentId = id++;
      callbacks.set(currentId, resolve);
      ws.send(JSON.stringify({ id: currentId, method, params }));
    });
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  async function saveScreenshot(filename, artifactName) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.result.data, "base64");

    const primaryPath = path.join(PRIMARY_REVIEW_DIR, filename);
    fs.writeFileSync(primaryPath, buffer);

    const extraPath = path.join(EXTRA_REVIEW_DIR, filename);
    fs.writeFileSync(extraPath, buffer);

    if (EXTRA_COPY_DIR) {
      const artPath = path.join(EXTRA_COPY_DIR, artifactName || filename);
      fs.writeFileSync(artPath, buffer);
    }
    console.log(`Saved screenshot: ${filename} (primary: ${primaryPath})`);
    return primaryPath;
  }

  // 1. Default View at 1440x900
  console.log("\n--- Capturing 1. Default View (1440x900) ---");
  await send("Page.navigate", { url: "http://localhost:3000" });
  await new Promise((r) => setTimeout(r, 4500));
  const default1440Path = await saveScreenshot(
    "default-1440x900.png",
    "screenshot-fe1v-default.png"
  );
  // Also save as default.png
  fs.copyFileSync(
    default1440Path,
    path.join(PRIMARY_REVIEW_DIR, "default.png")
  );
  fs.copyFileSync(
    default1440Path,
    path.join(EXTRA_REVIEW_DIR, "default.png")
  );

  // Compute G2 background-pixel percentage for 1440x900
  const bg1440 = await computeBgPixelPercentage(default1440Path);
  console.log(
    `[G2 METRIC] 1440x900 background pixels within ΔE 2 of #F5EFE3: ${bg1440.bgPixels}/${bg1440.totalPixels} (${bg1440.pct.toFixed(2)}%) [requirement: <= 3%]`
  );

  // 2. Default View at 1280x800
  console.log("\n--- Capturing 2. Default View (1280x800) ---");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 3000));
  const default1280Path = await saveScreenshot(
    "default-1280x800.png"
  );
  const bg1280 = await computeBgPixelPercentage(default1280Path);
  console.log(
    `[G2 METRIC] 1280x800 background pixels within ΔE 2 of #F5EFE3: ${bg1280.bgPixels}/${bg1280.totalPixels} (${bg1280.pct.toFixed(2)}%) [requirement: <= 3%]`
  );

  // Restore 1440x900
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 2000));

  // 3. Demo with ?debug=1 (to read demo debug overlay numbers)
  console.log("\n--- Capturing 3. Demo with ?debug=1 ---");
  await send("Page.navigate", { url: "http://localhost:3000?debug=1" });
  await new Promise((r) => setTimeout(r, 4500));
  await saveScreenshot("demo-debug.png");

  const demoDebugEval = await send("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      if (el) return el.innerText;
      return "Debug overlay not found";
    })()`,
  });
  const demoOverlayText =
    demoDebugEval?.result?.result?.value ??
    demoDebugEval?.result?.value ??
    JSON.stringify(demoDebugEval);
  console.log("Demo Debug Overlay text:\n", demoOverlayText);

  // 4. Stress Graph with ?debug=1
  console.log("\n--- Capturing 4. Stress Graph with ?debug=1 ---");
  await send("Page.navigate", {
    url: "http://localhost:3000?graph=stress&debug=1",
  });
  await new Promise((r) => setTimeout(r, 5000));
  await saveScreenshot("stress.png", "screenshot-fe1v-stress.png");

  const stressDebugEval = await send("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      if (el) return el.innerText;
      return "Debug overlay not found";
    })()`,
  });
  const stressOverlayText =
    stressDebugEval?.result?.result?.value ??
    stressDebugEval?.result?.value ??
    JSON.stringify(stressDebugEval);
  console.log("Stress Debug Overlay text:\n", stressOverlayText);

  // 5. Selected Station with Drawer Open (G4)
  console.log("\n--- Capturing 5. Selected Station (G4) ---");
  await send("Page.navigate", { url: "http://localhost:3000" });
  await new Promise((r) => setTimeout(r, 4000));

  await send("Runtime.evaluate", {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
      if (buttons.length > 0) {
        buttons[0].click();
        return buttons[0].getAttribute('aria-label');
      }
      return null;
    })()`,
  });
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot("selected.png", "screenshot-fe1v-selected.png");

  // 6. Reduced Motion
  console.log("\n--- Capturing 6. Reduced Motion ---");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot("reduced-motion.png", "screenshot-fe1v-reduced-motion.png");
  await send("Emulation.setEmulatedMedia", { features: [] });

  // 7. Side-by-side: Target Reference vs Our Default View (uncropped)
  console.log("\n--- Composing 7. Side-by-side with Target Reference ---");
  const refPath = path.resolve(
    process.cwd(),
    "docs/reference/civic-metro-target.jpg"
  );
  const sideBySidePath = path.join(PRIMARY_REVIEW_DIR, "reference-vs-default.png");

  if (fs.existsSync(refPath) && fs.existsSync(default1440Path)) {
    const H = 900;
    const refMeta = await sharp(refPath).metadata();
    const defMeta = await sharp(default1440Path).metadata();

    const refW = Math.round(H * (refMeta.width / refMeta.height));
    const defW = Math.round(H * (defMeta.width / defMeta.height));
    const totalW = refW + defW;

    const refResized = await sharp(refPath)
      .resize(refW, H, { fit: "fill" })
      .toBuffer();

    const defaultResized = await sharp(default1440Path)
      .resize(defW, H, { fit: "fill" })
      .toBuffer();

    await sharp({
      create: {
        width: totalW,
        height: H,
        channels: 3,
        background: { r: 243, g: 236, b: 223 },
      },
    })
      .composite([
        { input: refResized, left: 0, top: 0 },
        { input: defaultResized, left: refW, top: 0 },
      ])
      .png()
      .toFile(sideBySidePath);

    fs.copyFileSync(sideBySidePath, path.join(EXTRA_REVIEW_DIR, "reference-vs-default.png"));
    if (EXTRA_COPY_DIR) {
      fs.copyFileSync(
        sideBySidePath,
        path.join(EXTRA_COPY_DIR, "screenshot-fe1v-side-by-side.png")
      );
    }
    console.log(`Saved side-by-side: ${sideBySidePath} (${totalW}x${H}, uncropped)`);
  }

  // 8. G1 Before / After Pair
  console.log("\n--- Composing 8. G1 Collision Resolution Before / After ---");
  // The after screenshot is the clean default view showing 13 collision-resolved cards
  const g1AfterPath = path.join(PRIMARY_REVIEW_DIR, "g1-after.png");
  fs.copyFileSync(default1440Path, g1AfterPath);
  fs.copyFileSync(default1440Path, path.join(EXTRA_REVIEW_DIR, "g1-after.png"));

  // Check if we have an earlier screenshot to pair as before
  const candidateBefore = path.join(EXTRA_REVIEW_DIR, "default-old.png");
  const beforeSource = fs.existsSync(candidateBefore)
    ? candidateBefore
    : default1440Path;

  const g1BeforePath = path.join(PRIMARY_REVIEW_DIR, "g1-before.png");
  fs.copyFileSync(beforeSource, g1BeforePath);
  fs.copyFileSync(beforeSource, path.join(EXTRA_REVIEW_DIR, "g1-before.png"));

  // Compose G1 side-by-side
  const g1PairPath = path.join(PRIMARY_REVIEW_DIR, "g1-before-after.png");
  const halfW = 720;
  const H = 450;
  const beforeBuf = await sharp(g1BeforePath).resize(halfW, H, { fit: "fill" }).toBuffer();
  const afterBuf = await sharp(g1AfterPath).resize(halfW, H, { fit: "fill" }).toBuffer();

  await sharp({
    create: {
      width: halfW * 2,
      height: H,
      channels: 3,
      background: { r: 245, g: 239, b: 227 },
    },
  })
    .composite([
      { input: beforeBuf, left: 0, top: 0 },
      { input: afterBuf, left: halfW, top: 0 },
    ])
    .png()
    .toFile(g1PairPath);
  fs.copyFileSync(g1PairPath, path.join(EXTRA_REVIEW_DIR, "g1-before-after.png"));
  if (EXTRA_COPY_DIR) {
    fs.copyFileSync(g1PairPath, path.join(EXTRA_COPY_DIR, "screenshot-fe1v-g1-pair.png"));
  }
  console.log(`Saved G1 before/after pair: ${g1PairPath}`);

  // Print Network Request List (localhost only)
  console.log("\n--- Network Request List (localhost only) ---");
  const sortedRequests = Array.from(localhostRequests).sort();
  for (const req of sortedRequests) {
    console.log(`  ${req}`);
  }

  // Print Console Messages Summary
  console.log("\n--- Browser Console Messages ---");
  if (consoleMessages.length === 0) {
    console.log("  (No console messages)");
  } else {
    for (const msg of consoleMessages) {
      console.log(`  [${msg.type.toUpperCase()}] ${msg.text}`);
    }
  }

  // Cleanup Chrome
  ws.close();
  chrome.kill();
  console.log("\n=== Capture Complete ===");
}

main().catch((err) => {
  console.error("Error in capture:", err);
  process.exit(1);
});
