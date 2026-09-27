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
  console.log("=== Starting FE-1V Stage 1 Screenshot & Metrics Capture (1440x900) ===");

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

  // 1. Default View
  console.log("\n--- Capturing 1. Default View ---");
  await send("Page.navigate", { url: "http://localhost:3000" });
  await new Promise((r) => setTimeout(r, 4000));
  const defaultPath = path.join(REVIEW_DIR, "default.png");
  await takeScreenshot(defaultPath, "screenshot-fe1v-default.png");

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
  console.log("Stress Debug Overlay text:\n", debugEval.result.value);

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
  // Zoom in by evaluating camera move or wheel
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

  // 6. Side-by-side: Target Reference vs Our Default View
  console.log("\n--- Composing 6. Side-by-side with Target Reference ---");
  const refPath = path.resolve(process.cwd(), "docs/reference/civic-metro-target.jpg");
  const sideBySidePath = path.join(REVIEW_DIR, "reference-vs-default.png");

  if (fs.existsSync(refPath) && fs.existsSync(defaultPath)) {
    const halfWidth = 720;
    const height = 900;

    const refResized = await sharp(refPath)
      .resize(halfWidth, height, { fit: "cover" })
      .toBuffer();

    const defaultResized = await sharp(defaultPath)
      .resize(halfWidth, height, { fit: "cover" })
      .toBuffer();

    await sharp({
      create: {
        width: 1440,
        height: 900,
        channels: 3,
        background: { r: 243, g: 236, b: 223 },
      },
    })
      .composite([
        { input: refResized, left: 0, top: 0 },
        { input: defaultResized, left: halfWidth, top: 0 },
      ])
      .png()
      .toFile(sideBySidePath);

    const artSideBySide = path.join(ARTIFACTS_DIR, "screenshot-fe1v-side-by-side.png");
    fs.copyFileSync(sideBySidePath, artSideBySide);
    console.log(`Saved side-by-side: ${sideBySidePath} & ${artSideBySide}`);
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
