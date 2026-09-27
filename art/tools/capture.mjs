import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const REVIEW_DIR = path.resolve(process.cwd(), "art/out/review");
const ARTIFACTS_DIR = "/Users/shridhartawate/.gemini/antigravity/brain/36d77528-1f30-4659-bc8a-479ce47b7084";

if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

async function main() {
  console.log("=== Starting FE-1V Stage 1 Screenshot & Metrics Capture ===");

  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
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

  async function takeScreenshot(filePath, artifactName) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.result.data, "base64");
    fs.writeFileSync(filePath, buffer);
    if (artifactName) {
      const artPath = path.join(ARTIFACTS_DIR, artifactName);
      fs.writeFileSync(artPath, buffer);
      console.log(`Saved: ${filePath} & ${artPath}`);
    } else {
      console.log(`Saved: ${filePath}`);
    }
  }

  async function checkSafeArea(viewportName) {
    const check = await send("Runtime.evaluate", {
      expression: `(() => {
        const insets = { left: 24, right: 24, top: 110, bottom: 120 };
        const safeMinX = insets.left;
        const safeMaxX = window.innerWidth - insets.right;
        const safeMinY = insets.top;
        const safeMaxY = window.innerHeight - insets.bottom;

        const clipped = [];
        const buttons = Array.from(document.querySelectorAll('[data-testid="label-layer"] button'));
        for (const el of buttons) {
          if (el.style.visibility === "hidden" || el.offsetParent === null) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < safeMinX - 2 || r.right > safeMaxX + 2 || r.top < safeMinY - 2 || r.bottom > safeMaxY + 2) {
            clipped.push({
              type: el.getAttribute("aria-label")?.includes("pin") ? "pin" : "card",
              label: el.getAttribute("aria-label"),
              rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }
            });
          }
        }

        const headers = Array.from(document.querySelectorAll('[data-testid="stage-headers"] > div'));
        for (const el of headers) {
          if (el.style.visibility === "hidden" || el.offsetParent === null) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < safeMinX - 2 || r.right > safeMaxX + 2 || r.top < safeMinY - 2 || r.bottom > safeMaxY + 2) {
            clipped.push({
              type: "header",
              text: el.innerText,
              rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }
            });
          }
        }

        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          safeBounds: { safeMinX, safeMaxX, safeMinY, safeMaxY },
          clippedCount: clipped.length,
          clipped,
        };
      })()`,
      returnByValue: true,
    });

    const res = check.result?.result?.value ?? check.result?.value;
    console.log(`Safe Area Audit (${viewportName}): viewport ${res.viewport.width}x${res.viewport.height}, insets: [24, 24, 110, 120]`);
    console.log(`  Safe Bounds: X in [${res.safeBounds.safeMinX}, ${res.safeBounds.safeMaxX}], Y in [${res.safeBounds.safeMinY}, ${res.safeBounds.safeMaxY}]`);
    console.log(`  Clipped elements count: ${res.clippedCount}`);
    if (res.clippedCount > 0) {
      console.log(`  Clipped details:`, JSON.stringify(res.clipped, null, 2));
    } else {
      console.log(`  All cards, pins, and stage headers lie strictly inside the safe area!`);
    }
    return res;
  }

  // 1. Default View at 1440x900
  console.log("\n--- Capturing 1. Default View (1440x900) ---");
  await send("Page.navigate", { url: "http://localhost:3000" });
  await new Promise((r) => setTimeout(r, 4500));
  const defaultPath = path.join(REVIEW_DIR, "default.png");
  await takeScreenshot(defaultPath, "screenshot-fe1v-default.png");

  // Audit Safe Area at 1440x900 (F4)
  await checkSafeArea("1440x900");

  // Audit Safe Area at 1280x800 (F4)
  console.log("\n--- Capturing Safe Area Check at 1280x800 (F4) ---");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 3000));
  const default1280Path = path.join(REVIEW_DIR, "default-1280x800.png");
  await takeScreenshot(default1280Path);
  await checkSafeArea("1280x800");

  // Restore 1440x900
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 2000));

  // Sample 5 Building Pixels in Back Half of Board (F1)
  console.log("\n--- F1: Sampling 5 Building Pixels in Back Half of Board ---");
  const { data: rawImgData, info: imgInfo } = await sharp(defaultPath).raw().toBuffer({ resolveWithObject: true });
  function getPixel(x, y) {
    const idx = (y * imgInfo.width + x) * imgInfo.channels;
    const r = rawImgData[idx];
    const g = rawImgData[idx + 1];
    const b = rawImgData[idx + 2];
    const hex = "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("");
    return { x, y, r, g, b, hex };
  }

  // 5 verified building coordinates in the back half of the board (y in [330, 440], x in [790, 1100])
  const sampleCoords = [
    { x: 795, y: 330 },
    { x: 985, y: 330 },
    { x: 1090, y: 330 },
    { x: 855, y: 335 },
    { x: 925, y: 335 },
  ];

  const sampledPixels = sampleCoords.map((c) => getPixel(c.x, c.y));
  console.log("Sampled 5 building pixels in back half of diorama (F1):");
  for (const p of sampledPixels) {
    const isDarker = p.r <= 239 && p.g <= 234 && p.b <= 224;
    console.log(`  Pixel (${p.x}, ${p.y}): ${p.hex} (R=${p.r}, G=${p.g}, B=${p.b}) -> darker/richer than #EFEAE0: ${isDarker}`);
  }

  // 2. Stress Graph with ?debug=1
  console.log("\n--- Capturing 2. Stress Graph with ?debug=1 ---");
  await send("Page.navigate", { url: "http://localhost:3000?graph=stress&debug=1" });
  await new Promise((r) => setTimeout(r, 5000));
  const stressPath = path.join(REVIEW_DIR, "stress.png");
  await takeScreenshot(stressPath, "screenshot-fe1v-stress.png");

  // Read debug numbers from debug overlay
  const debugEval = await send("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      if (el) return el.innerText;
      return "Debug overlay not found";
    })()`,
  });
  const overlayText = debugEval?.result?.result?.value ?? debugEval?.result?.value ?? JSON.stringify(debugEval);
  console.log("Stress Debug Overlay text:\n", overlayText);

  // 3. Selected Station
  console.log("\n--- Capturing 3. Selected Station ---");
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
  const selectedPath = path.join(REVIEW_DIR, "selected.png");
  await takeScreenshot(selectedPath, "screenshot-fe1v-selected.png");

  // 4. Reduced Motion
  console.log("\n--- Capturing 4. Reduced Motion ---");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await new Promise((r) => setTimeout(r, 2000));
  const reducedMotionPath = path.join(REVIEW_DIR, "reduced-motion.png");
  await takeScreenshot(reducedMotionPath, "screenshot-fe1v-reduced-motion.png");

  // Reset emulation
  await send("Emulation.setEmulatedMedia", { features: [] });

  // 5. Close-up Zoom (D1 check)
  console.log("\n--- Capturing 5. Close-up Zoom (D1 check) ---");
  await send("Runtime.evaluate", {
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        for (let i = 0; i < 8; i++) {
          canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 720, clientY: 450, bubbles: true }));
        }
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 2000));
  const closeupPath = path.join(REVIEW_DIR, "closeup.png");
  await takeScreenshot(closeupPath, "screenshot-fe1v-closeup.png");

  // 6. Side-by-side: Target Reference vs Our Default View (F6: scaled to same height, whole, not cropped)
  console.log("\n--- Composing 6. Side-by-side with Target Reference (F6: uncropped) ---");
  const refPath = path.resolve(process.cwd(), "docs/reference/civic-metro-target.jpg");
  const sideBySidePath = path.join(REVIEW_DIR, "reference-vs-default.png");

  if (fs.existsSync(refPath) && fs.existsSync(defaultPath)) {
    const H = 900;
    const refMeta = await sharp(refPath).metadata();
    const defMeta = await sharp(defaultPath).metadata();

    const refW = Math.round(H * (refMeta.width / refMeta.height));
    const defW = Math.round(H * (defMeta.width / defMeta.height));
    const totalW = refW + defW;

    const refResized = await sharp(refPath)
      .resize(refW, H, { fit: "fill" })
      .toBuffer();

    const defaultResized = await sharp(defaultPath)
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

    const artSideBySide = path.join(ARTIFACTS_DIR, "screenshot-fe1v-side-by-side.png");
    fs.copyFileSync(sideBySidePath, artSideBySide);
    console.log(`Saved side-by-side: ${sideBySidePath} & ${artSideBySide} (${totalW}x${H}, uncropped)`);
  }

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
