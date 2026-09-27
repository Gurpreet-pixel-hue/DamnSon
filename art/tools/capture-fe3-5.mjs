import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REVIEW_DIR = path.resolve(process.cwd(), ".next/claude-review/fe-3.5");
if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

const CHROME_PATH =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  console.log("=== Starting FE-3.5 Verification & Screenshot Capture ===");
  console.log(`Using Chrome: ${CHROME_PATH}`);

  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9225",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=metal",
    "--window-size=1440,900",
    "about:blank",
  ]);

  await new Promise((r) => setTimeout(r, 2500));

  const listRes = await fetch("http://localhost:9225/json/list");
  const pages = await listRes.json();
  const page = pages.find((p) => p.type === "page") || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 1;
  const callbacks = new Map();
  const consoleMessages = [];
  const networkRequests = new Set();

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
      if (type === "error" || type === "warning") {
        console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
      }
    }
    if (data.method === "Network.requestWillBeSent") {
      const url = data.params.request.url;
      networkRequests.add(url);
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

  async function saveScreenshot(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.result.data, "base64");
    const outPath = path.join(REVIEW_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${filename} -> ${outPath}`);
    return outPath;
  }

  async function evaluateExpr(expression) {
    const evalRes = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    return evalRes?.result?.result?.value;
  }

  async function checkPageScroll(label) {
    const info = await evaluateExpr(`(() => {
      return {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        docScrollWidth: document.documentElement.scrollWidth,
        docScrollHeight: document.documentElement.scrollHeight,
        winInnerWidth: window.innerWidth,
        winInnerHeight: window.innerHeight,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
      };
    })()`);
    console.log(`Scroll Check [${label}]:`, JSON.stringify(info));
    return info;
  }

  async function getDebugNumbers() {
    return await evaluateExpr(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, " | ") : "Not found";
    })()`);
  }

  // -------------------------------------------------------------------------
  // 1. Default view: demo-metro-synthetic
  // -------------------------------------------------------------------------
  console.log("\n--- 1. Demo Default View (1440x900) ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 5500));
  await saveScreenshot("demo-default-1440x900.png");
  const demoNumbers = await getDebugNumbers();
  console.log("Demo Debug Numbers (verbatim):", demoNumbers);
  await checkPageScroll("demo 1440x900");

  // -------------------------------------------------------------------------
  // 2. Default view: example-startup
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Example Startup Default View (1440x900) ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/example-startup?debug=1",
  });
  await new Promise((r) => setTimeout(r, 5500));
  await saveScreenshot("example-startup-default-1440x900.png");
  const startupNumbers = await getDebugNumbers();
  console.log("Example Startup Debug Numbers (verbatim):", startupNumbers);

  // -------------------------------------------------------------------------
  // 3. Default view: stress-25-synthetic
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Stress Default View (1440x900) ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/stress-25-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 6000));
  await saveScreenshot("stress-default-1440x900.png");
  const stressNumbers = await getDebugNumbers();
  console.log("Stress Debug Numbers (verbatim):", stressNumbers);

  // -------------------------------------------------------------------------
  // 4. Close-up of street with cars and pedestrians
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Close-up of street with cars and pedestrians ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 4500));
  // Zoom in towards street via mouseWheel on canvas
  for (let i = 0; i < 4; i++) {
    await send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 750,
      y: 480,
      deltaX: 0,
      deltaY: -800,
    });
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 1500));
  await saveScreenshot("street-closeup-1440x900.png");

  // -------------------------------------------------------------------------
  // 5. Online vs In-person vs Hybrid close-up
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Online vs In-person vs Hybrid close-up ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic",
  });
  await new Promise((r) => setTimeout(r, 4500));

  // 5a. Online kiosk close-up
  await evaluateExpr(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      (b.textContent && b.textContent.includes('Verify digital')) ||
      (b.getAttribute('aria-label') && b.getAttribute('aria-label').includes('Verify digital'))
    );
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 1200));
  await saveScreenshot("mode-online-kiosk-closeup-1440x900.png");

  // 5b. In-person office close-up (Fire safety NOC)
  await evaluateExpr(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      (b.textContent && b.textContent.includes('Fire')) ||
      (b.getAttribute('aria-label') && b.getAttribute('aria-label').includes('Fire'))
    );
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 1200));
  await saveScreenshot("mode-inperson-office-closeup-1440x900.png");

  // 5c. Hybrid office close-up (Utility meter)
  await evaluateExpr(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      (b.textContent && b.textContent.includes('electric')) ||
      (b.getAttribute('aria-label') && b.getAttribute('aria-label').includes('electric'))
    );
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 1200));
  await saveScreenshot("mode-hybrid-office-closeup-1440x900.png");

  // Close drawer
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await new Promise((r) => setTimeout(r, 800));

  // -------------------------------------------------------------------------
  // 6. Mark done sequence: before, just after (unlock pop), and after undo
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Mark Done Sequence ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic",
  });
  await new Promise((r) => setTimeout(r, 4500));

  // Click card for station 1 to open drawer
  console.log("Clicking card to open drawer...");
  await evaluateExpr(`(() => {
    const card = document.querySelector('button[data-mode="full"]');
    if (card) card.click();
  })()`);
  await new Promise((r) => setTimeout(r, 1200));
  await saveScreenshot("mark-done-before-1440x900.png");

  // Click "Mark as complete" button in drawer (data-testid="drawer-mark-done-btn")
  console.log("Triggering Mark as complete...");
  await evaluateExpr(`(() => {
    const btn = document.querySelector('[data-testid="drawer-mark-done-btn"]');
    if (btn) btn.click();
  })()`);
  // Capture immediately during unlock pop (within 250ms)
  await new Promise((r) => setTimeout(r, 250));
  await saveScreenshot("mark-done-just-after-1440x900.png");

  // Wait for undo toast to be visible, then click Undo on toast
  console.log("Triggering Undo on toast...");
  await new Promise((r) => setTimeout(r, 1200));
  await evaluateExpr(`(() => {
    const undoBtn = document.querySelector('[data-testid="undo-toast-btn"]');
    if (undoBtn) undoBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  await saveScreenshot("mark-done-after-undo-1440x900.png");

  // Close drawer with Escape
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await new Promise((r) => setTimeout(r, 1000));

  // -------------------------------------------------------------------------
  // 7. Labels: Key steps vs All
  // -------------------------------------------------------------------------
  console.log("\n--- 7. Labels: Key steps vs All ---");
  // Default is Key steps
  await saveScreenshot("labels-key-steps-1440x900.png");

  // Click "All" toggle
  console.log("Toggling to 'All' labels mode...");
  await send("Runtime.evaluate", {
    expression: `(() => {
      const btnAll = document.querySelector('[data-testid="footer-toggle-labels-all"]');
      if (btnAll) btnAll.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 800));
  await saveScreenshot("labels-all-1440x900.png");

  // Toggle back to "Key steps"
  await send("Runtime.evaluate", {
    expression: `(() => {
      const btnKey = document.querySelector('[data-testid="footer-toggle-labels-key"]');
      if (btnKey) btnKey.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 500));

  // -------------------------------------------------------------------------
  // 8. Reduced Motion
  // -------------------------------------------------------------------------
  console.log("\n--- 8. Reduced Motion View ---");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 4500));
  await saveScreenshot("reduced-motion-1440x900.png");

  // Reset emulated media
  await send("Emulation.setEmulatedMedia", { features: [] });

  // -------------------------------------------------------------------------
  // 9. Six Frames of Traffic at Default View
  // -------------------------------------------------------------------------
  console.log("\n--- 9. Capturing 6 Frames of Traffic at Default View ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic",
  });
  await new Promise((r) => setTimeout(r, 4000));
  for (let f = 1; f <= 6; f++) {
    await saveScreenshot(`traffic-frame-${f}.png`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  // -------------------------------------------------------------------------
  // 10. Check at 1280x800 for page scroll
  // -------------------------------------------------------------------------
  console.log("\n--- 10. Checking 1280x800 Viewport ---");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot("demo-1280x800.png");
  await checkPageScroll("demo 1280x800");

  // -------------------------------------------------------------------------
  // 11. Console & Network Analysis
  // -------------------------------------------------------------------------
  console.log("\n=== Console & Network Summary ===");
  const nonClockWarnings = consoleMessages.filter(
    (m) =>
      (m.type === "error" || m.type === "warning") &&
      !m.text.includes("THREE.Clock")
  );
  console.log(`Console messages total: ${consoleMessages.length}`);
  console.log(`Non-clock warnings/errors count: ${nonClockWarnings.length}`);
  if (nonClockWarnings.length > 0) {
    console.log("Non-clock warnings/errors:", JSON.stringify(nonClockWarnings, null, 2));
  } else {
    console.log("Console is 100% clean (only THREE.Clock warning allowed).");
  }

  const nonLocalhostRequests = Array.from(networkRequests).filter((url) => {
    try {
      const u = new URL(url);
      return u.hostname !== "localhost" && u.hostname !== "127.0.0.1";
    } catch {
      return false;
    }
  });
  console.log(`Total network request URLs captured: ${networkRequests.size}`);
  console.log(`External requests: ${nonLocalhostRequests.length}`);
  if (nonLocalhostRequests.length > 0) {
    console.log("Non-localhost requests:", nonLocalhostRequests);
  } else {
    console.log("All network requests go to localhost only.");
  }

  // Cleanup
  ws.close();
  chrome.kill();
  console.log("\n=== Capture Complete! ===");
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
