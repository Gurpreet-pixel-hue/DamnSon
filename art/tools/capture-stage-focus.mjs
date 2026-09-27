import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REVIEW_DIR = path.resolve(process.cwd(), ".next/claude-review/fe-3.5-stage");
if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

const CHROME_PATH =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  console.log("=== Starting FE-3.5 Stage Focus Verification & Screenshot Capture ===");
  console.log(`Using Chrome: ${CHROME_PATH}`);

  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9227",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=metal",
    "--window-size=1440,900",
    "about:blank",
  ]);

  await new Promise((r) => setTimeout(r, 2500));

  const listRes = await fetch("http://localhost:9227/json/list");
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
      awaitPromise: true,
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
  // 1. First View: demo-metro-synthetic
  // -------------------------------------------------------------------------
  console.log("\n--- 1. First View (1440x900) ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 5500));

  const firstViewCardsCount = await evaluateExpr(`(() => {
    return document.querySelectorAll('[data-testid="label-layer"] [data-station-id]').length;
  })()`);
  const pinsCount = await evaluateExpr(`(() => {
    return document.querySelectorAll('[data-testid="state-pin"]').length;
  })()`);
  console.log(`Cards visible in first view: ${firstViewCardsCount}`);
  console.log(`Pins in first view (must be 0): ${pinsCount}`);

  await saveScreenshot("first-view.png");
  const demoDefaultDebug = await getDebugNumbers();
  console.log("Demo Default Stage View Debug Numbers (verbatim):", demoDefaultDebug);
  await checkPageScroll("demo 1440x900");

  // -------------------------------------------------------------------------
  // 2. Hover Displacement Check (10 sweeps at 150 ms)
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Hover Displacement Check ---");
  const hoverDisplacement = await evaluateExpr(`(async () => {
    const getRects = () => {
      const map = {};
      document.querySelectorAll('[data-testid="label-layer"] [data-station-id]').forEach(el => {
        const id = el.getAttribute('data-station-id');
        const r = el.getBoundingClientRect();
        map[id] = { left: r.left, top: r.top, width: r.width, height: r.height };
      });
      return map;
    };

    const initial = getRects();
    let maxDisplacement = 0;
    const cards = Array.from(document.querySelectorAll('[data-testid="label-layer"] [data-station-id]'));

    for (let sweep = 0; sweep < 10; sweep++) {
      for (const card of cards) {
        card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await new Promise(r => setTimeout(r, 75));
        const current = getRects();
        for (const [id, r0] of Object.entries(initial)) {
          const r1 = current[id];
          if (r1) {
            const dx = Math.abs(r1.left - r0.left);
            const dy = Math.abs(r1.top - r0.top);
            if (dx > maxDisplacement) maxDisplacement = dx;
            if (dy > maxDisplacement) maxDisplacement = dy;
          }
        }
        card.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        await new Promise(r => setTimeout(r, 75));
      }
    }
    return maxDisplacement;
  })()`);
  console.log(`Hover max wrapper displacement: ${hoverDisplacement} px`);

  // -------------------------------------------------------------------------
  // 3. Click Card, Open/Close Drawer, Canvas Size Invariance
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Click Card & Drawer Invariance ---");
  const drawerCheck = await evaluateExpr(`(async () => {
    const canvas = document.querySelector('canvas');
    const r0 = canvas.getBoundingClientRect();
    const canvasBefore = { width: Math.round(r0.width), height: Math.round(r0.height) };

    const getRects = () => {
      const map = {};
      document.querySelectorAll('[data-testid="label-layer"] [data-station-id]').forEach(el => {
        const id = el.getAttribute('data-station-id');
        const r = el.getBoundingClientRect();
        map[id] = { left: r.left, top: r.top, width: r.width, height: r.height };
      });
      return map;
    };

    const initial = getRects();

    // Click first card
    const firstBtn = document.querySelector('[data-testid="label-layer"] [data-station-id] button');
    if (firstBtn) firstBtn.click();

    await new Promise(r => setTimeout(r, 800));

    const r1 = canvas.getBoundingClientRect();
    const canvasAfter = { width: Math.round(r1.width), height: Math.round(r1.height) };

    const current = getRects();
    let maxDisplacement = 0;
    for (const [id, rect0] of Object.entries(initial)) {
      const rect1 = current[id];
      if (rect1) {
        const dx = Math.abs(rect1.left - rect0.left);
        const dy = Math.abs(rect1.top - rect0.top);
        if (dx > maxDisplacement) maxDisplacement = dx;
        if (dy > maxDisplacement) maxDisplacement = dy;
      }
    }

    return {
      canvasBefore,
      canvasAfter,
      canvasDeltaW: Math.abs(canvasAfter.width - canvasBefore.width),
      canvasDeltaH: Math.abs(canvasAfter.height - canvasBefore.height),
      maxDisplacement,
    };
  })()`);

  console.log(`Canvas before drawer: ${drawerCheck.canvasBefore.width}x${drawerCheck.canvasBefore.height}`);
  console.log(`Canvas after drawer:  ${drawerCheck.canvasAfter.width}x${drawerCheck.canvasAfter.height}`);
  console.log(`Canvas size delta:    ${drawerCheck.canvasDeltaW}x${drawerCheck.canvasDeltaH} px`);
  console.log(`Click & Drawer max wrapper displacement: ${drawerCheck.maxDisplacement} px`);

  await saveScreenshot("drawer-open.png");

  // Close drawer
  await evaluateExpr(`(() => {
    const closeBtn = document.querySelector('[data-testid="drawer-close-button"]');
    if (closeBtn) closeBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 600));

  // -------------------------------------------------------------------------
  // 4. Mark Done Sequence
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Mark Done Sequence ---");
  // Select first card to open drawer
  await evaluateExpr(`(() => {
    const firstBtn = document.querySelector('[data-testid="label-layer"] [data-station-id] button');
    if (firstBtn) firstBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 800));
  await saveScreenshot("mark-done-before.png");

  // Check displacement when marking done
  const markDoneDisplacement = await evaluateExpr(`(async () => {
    const getRects = () => {
      const map = {};
      document.querySelectorAll('[data-testid="label-layer"] [data-station-id]').forEach(el => {
        const id = el.getAttribute('data-station-id');
        const r = el.getBoundingClientRect();
        map[id] = { left: r.left, top: r.top, width: r.width, height: r.height };
      });
      return map;
    };

    const initial = getRects();
    const btn = document.querySelector('[data-testid="drawer-mark-done-btn"]');
    if (btn) btn.click();

    await new Promise(r => setTimeout(r, 300));
    const current = getRects();

    let maxDisplacement = 0;
    const diffs = [];
    // Check non-marked other wrappers
    for (const [id, rect0] of Object.entries(initial)) {
      const rect1 = current[id];
      if (rect1) {
        const dx = Math.abs(Math.round(rect1.left) - Math.round(rect0.left));
        const dy = Math.abs(Math.round(rect1.top) - Math.round(rect0.top));
        diffs.push({ id, r0: rect0, r1: rect1, dx, dy });
        if (dx > maxDisplacement) maxDisplacement = dx;
        if (dy > maxDisplacement) maxDisplacement = dy;
      }
    }
    return { maxDisplacement, diffs };
  })()`);
  console.log(`Mark done other wrappers displacement: ${markDoneDisplacement.maxDisplacement} px`);
  console.log("Mark done rect diffs:", JSON.stringify(markDoneDisplacement.diffs));

  await saveScreenshot("mark-done-after.png");

  // Click Undo on toast
  await evaluateExpr(`(() => {
    const undoBtn = document.querySelector('[data-testid="undo-toast-btn"]');
    if (undoBtn) undoBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  await saveScreenshot("mark-done-undo.png");

  // Close drawer
  await evaluateExpr(`(() => {
    const closeBtn = document.querySelector('[data-testid="drawer-close-button"]');
    if (closeBtn) closeBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 600));

  // -------------------------------------------------------------------------
  // 5. Stage Stepper Navigation
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Stepper Sequence ---");
  const stageSequence = [];
  const initialStage = await evaluateExpr(`(() => {
    const el = document.querySelector('[data-testid="stepper-label"]');
    return el ? el.textContent.trim() : "";
  })()`);
  stageSequence.push(initialStage);
  await saveScreenshot("stage-1.png");

  for (let s = 2; s <= 5; s++) {
    await evaluateExpr(`(() => {
      const nextBtn = document.querySelector('[data-testid="stepper-next-btn"]');
      if (nextBtn) nextBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 900));
    const label = await evaluateExpr(`(() => {
      const el = document.querySelector('[data-testid="stepper-label"]');
      return el ? el.textContent.trim() : "";
    })()`);
    stageSequence.push(label);
    await saveScreenshot(`stage-${s}.png`);
  }

  // Step back to stage 1
  for (let s = 4; s >= 1; s--) {
    await evaluateExpr(`(() => {
      const prevBtn = document.querySelector('[data-testid="stepper-prev-btn"]');
      if (prevBtn) prevBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 700));
    const label = await evaluateExpr(`(() => {
      const el = document.querySelector('[data-testid="stepper-label"]');
      return el ? el.textContent.trim() : "";
    })()`);
    stageSequence.push(label);
  }
  await saveScreenshot("stepper-overview.png");
  console.log("Stage Sequence while stepping:", stageSequence.join(" -> "));

  // -------------------------------------------------------------------------
  // 6. Whole Route View & Budgets
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Whole Route View & Budgets ---");

  // 6a. Demo whole route
  console.log("Switching Demo to Whole Route View...");
  await evaluateExpr(`(() => {
    const btn = document.querySelector('[data-testid="footer-whole-route-toggle"]');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot("whole-route-demo.png");
  const demoWholeRouteDebug = await getDebugNumbers();
  console.log("Demo Whole Route Debug Numbers (verbatim):", demoWholeRouteDebug);

  // 6b. Example Startup
  console.log("\nNavigating to Example Startup (Whole Route)...");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/example-startup?debug=1",
  });
  await new Promise((r) => setTimeout(r, 4500));
  const exampleStartupDefaultDebug = await getDebugNumbers();
  console.log("Example Startup Default Debug Numbers (verbatim):", exampleStartupDefaultDebug);

  await evaluateExpr(`(() => {
    const btn = document.querySelector('[data-testid="footer-whole-route-toggle"]');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot("whole-route-example-startup.png");
  const exampleStartupWholeRouteDebug = await getDebugNumbers();
  console.log("Example Startup Whole Route Debug Numbers (verbatim):", exampleStartupWholeRouteDebug);

  // 6c. Stress 25
  console.log("\nNavigating to Stress 25 (Whole Route)...");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/stress-25-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 5500));
  const stressDefaultDebug = await getDebugNumbers();
  console.log("Stress Default Debug Numbers (verbatim):", stressDefaultDebug);

  await evaluateExpr(`(() => {
    const btn = document.querySelector('[data-testid="footer-whole-route-toggle"]');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot("whole-route-stress.png");
  const stressWholeRouteDebug = await getDebugNumbers();
  console.log("Stress Whole Route Debug Numbers (verbatim):", stressWholeRouteDebug);

  // -------------------------------------------------------------------------
  // 7. Flicker Check: Road Close-ups at 3 Zoom Levels
  // -------------------------------------------------------------------------
  console.log("\n--- 7. Road Close-ups at Three Zoom Levels ---");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic",
  });
  await new Promise((r) => setTimeout(r, 4500));

  // Zoom level 1
  await saveScreenshot("road-closeup-zoom1.png");

  // Zoom level 2 (scroll in)
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 720,
    y: 450,
    deltaX: 0,
    deltaY: -600,
  });
  await new Promise((r) => setTimeout(r, 1200));
  await saveScreenshot("road-closeup-zoom2.png");

  // Zoom level 3 (scroll in further)
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 720,
    y: 450,
    deltaX: 0,
    deltaY: -800,
  });
  await new Promise((r) => setTimeout(r, 1200));
  await saveScreenshot("road-closeup-zoom3.png");

  await send("Emulation.setEmulatedMedia", { features: [] });

  // -------------------------------------------------------------------------
  // 8. Viewport 1280x800 Scroll Check
  // -------------------------------------------------------------------------
  console.log("\n--- 8. Checking 1280x800 Viewport ---");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 1500));
  await saveScreenshot("demo-1280x800.png");
  await checkPageScroll("demo 1280x800");

  // -------------------------------------------------------------------------
  // 9. Summary & Console Analysis
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

  console.log("\n=== Stage Focus Capture Results Summary ===");
  console.log(`First View Cards Count: ${firstViewCardsCount}`);
  console.log(`First View Pins Count: ${pinsCount}`);
  console.log(`Hover Max Displacement: ${hoverDisplacement} px`);
  console.log(`Click & Drawer Max Displacement: ${drawerCheck.maxDisplacement} px`);
  console.log(`Canvas Size Delta: ${drawerCheck.canvasDeltaW}x${drawerCheck.canvasDeltaH} px`);
  console.log(`Mark Done Other Displacement: ${markDoneDisplacement.maxDisplacement} px`);
  console.log(`Stage Sequence: ${stageSequence.join(" -> ")}`);
  console.log(`Demo Default Debug: ${demoDefaultDebug}`);
  console.log(`Demo Whole Route Debug: ${demoWholeRouteDebug}`);
  console.log(`Startup Default Debug: ${exampleStartupDefaultDebug}`);
  console.log(`Startup Whole Route Debug: ${exampleStartupWholeRouteDebug}`);
  console.log(`Stress Default Debug: ${stressDefaultDebug}`);
  console.log(`Stress Whole Route Debug: ${stressWholeRouteDebug}`);

  // Cleanup
  ws.close();
  chrome.kill();
  console.log("\n=== Capture Complete! ===");
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
