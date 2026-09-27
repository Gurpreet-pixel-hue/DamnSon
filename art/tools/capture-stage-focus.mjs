import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REVIEW_DIR = path.resolve(process.cwd(), ".next/claude-review/fe-3.5-stage-2");
if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

const CHROME_PATH =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  console.log("=== Starting FE-3.5 Stage Focus 2 (Framing & Placement) Verification ===");
  console.log(`Review Directory: ${REVIEW_DIR}`);
  console.log(`Using Chrome: ${CHROME_PATH}`);

  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9228",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=metal",
    "--window-size=1440,900",
    "about:blank",
  ]);

  await new Promise((r) => setTimeout(r, 2500));

  const listRes = await fetch("http://localhost:9228/json/list");
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

  const capturedFiles = [];

  async function saveScreenshot(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.result.data, "base64");
    const outPath = path.join(REVIEW_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    const sizeBytes = fs.statSync(outPath).size;
    capturedFiles.push({ filename, path: outPath, sizeBytes });
    console.log(`Saved screenshot: ${filename} (${sizeBytes.toLocaleString()} bytes) -> ${outPath}`);
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

  // Helper to measure camera distance and focused anchor in safe rect
  async function getCameraAndAnchorMetrics() {
    return await evaluateExpr(`(() => {
      const controls = window.__CW_CONTROLS__ || (document.querySelector('canvas')?.__r3f?.root?.cameraControls);
      // Fallback: estimate from R3F camera
      const camera = document.querySelector('canvas')?.__r3f?.root?.camera;
      let distance = 0;
      if (controls && controls.distance) {
        distance = controls.distance;
      } else if (camera) {
        distance = camera.position.length();
      }

      // Check focused card anchor
      const firstCard = document.querySelector('[data-testid="label-layer"] [data-station-id]');
      let anchorInsideSafeRect = false;
      let cardRect = null;
      if (firstCard) {
        const r = firstCard.getBoundingClientRect();
        cardRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        // Safe rect: [24, 1440 - 24] x [56, 900 - 68]
        anchorInsideSafeRect = r.left >= 20 && r.right <= 1420 && r.top >= 50 && r.bottom <= 840;
      }

      return { distance, anchorInsideSafeRect, cardRect };
    })()`);
  }

  const fixtureFirstViews = {};

  // -------------------------------------------------------------------------
  // 1. First Views of demo, example-startup, stress
  // -------------------------------------------------------------------------
  console.log("\n--- 1. First View: demo-metro-synthetic ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 5500));
  await saveScreenshot("first-view-demo.png");
  await saveScreenshot("first-view.png");
  const demoMetrics = await getCameraAndAnchorMetrics();
  fixtureFirstViews["demo"] = demoMetrics;
  const demoDefaultDebug = await getDebugNumbers();
  console.log("Demo First View Metrics:", demoMetrics);
  console.log("Demo Default Stage View Debug Numbers:", demoDefaultDebug);
  await checkPageScroll("demo 1440x900");

  console.log("\n--- 1b. First View: example-startup ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/example-startup?debug=1",
  });
  await new Promise((r) => setTimeout(r, 4500));
  await saveScreenshot("first-view-startup.png");
  const startupMetrics = await getCameraAndAnchorMetrics();
  fixtureFirstViews["example-startup"] = startupMetrics;
  const startupDefaultDebug = await getDebugNumbers();
  console.log("Startup First View Metrics:", startupMetrics);
  console.log("Startup Default Stage View Debug Numbers:", startupDefaultDebug);

  console.log("\n--- 1c. First View: stress-25-synthetic ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/stress-25-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 5000));
  await saveScreenshot("first-view-stress.png");
  const stressMetrics = await getCameraAndAnchorMetrics();
  fixtureFirstViews["stress"] = stressMetrics;
  const stressDefaultDebug = await getDebugNumbers();
  console.log("Stress First View Metrics:", stressMetrics);
  console.log("Stress Default Stage View Debug Numbers:", stressDefaultDebug);

  // -------------------------------------------------------------------------
  // 2. Every stage of example-startup
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Every Stage of example-startup ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/example-startup?debug=1",
  });
  await new Promise((r) => setTimeout(r, 4500));

  let stage4Metrics = null;

  // Find number of stages
  const stageCount = await evaluateExpr(`(() => {
    return document.querySelectorAll('[data-testid="stage-stepper"] button[aria-label*="Stage"]').length || 5;
  })()`);

  console.log(`Total stages in example-startup: ${stageCount}`);

  for (let s = 1; s <= stageCount; s++) {
    if (s > 1) {
      await evaluateExpr(`(() => {
        const nextBtn = document.querySelector('[data-testid="stepper-next-btn"]');
        if (nextBtn) nextBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 1200));
    }
    const label = await evaluateExpr(`(() => {
      const el = document.querySelector('[data-testid="stepper-label"]');
      return el ? el.textContent.trim() : "";
    })()`);
    console.log(`Captured Stage ${s}: ${label}`);
    await saveScreenshot(`startup-stage-${s}.png`);
    await saveScreenshot(`stage-${s}.png`);

    // On Stage 4: measure card-card and card-obstacle overlap, tether length
    if (s === 4) {
      stage4Metrics = await evaluateExpr(`(() => {
        const cards = Array.from(document.querySelectorAll('[data-testid="label-layer"] [data-station-id]'));
        const rects = cards.map(c => {
          const r = c.getBoundingClientRect();
          return { id: c.getAttribute('data-station-id'), minX: r.left, maxX: r.right, minY: r.top, maxY: r.bottom };
        });

        // Compute pairwise card-card overlap area in px²
        let totalCardCardOverlap = 0;
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i];
            const b = rects[j];
            const ox = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
            const oy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
            totalCardCardOverlap += (ox * oy);
          }
        }

        // Stepper obstacle: [ (1440-280)/2, (1440+280)/2 ] x [ 900-68, 900 ]
        const stepperObstacle = { minX: 580, maxX: 860, minY: 832, maxY: 900 };
        let totalCardObstacleOverlap = 0;
        for (const a of rects) {
          const ox = Math.max(0, Math.min(a.maxX, stepperObstacle.maxX) - Math.max(a.minX, stepperObstacle.minX));
          const oy = Math.max(0, Math.min(a.maxY, stepperObstacle.maxY) - Math.max(a.minY, stepperObstacle.minY));
          totalCardObstacleOverlap += (ox * oy);
        }

        // Check chips obstacles
        const chips = Array.from(document.querySelectorAll('[data-testid="stage-headers"] > div'));
        for (const chip of chips) {
          if (chip.style.visibility !== 'hidden') {
            const cr = chip.getBoundingClientRect();
            if (cr.width > 0 && cr.height > 0) {
              const chipRect = { minX: cr.left, maxX: cr.right, minY: cr.top, maxY: cr.bottom };
              for (const a of rects) {
                const ox = Math.max(0, Math.min(a.maxX, chipRect.maxX) - Math.max(a.minX, chipRect.minX));
                const oy = Math.max(0, Math.min(a.maxY, chipRect.maxY) - Math.max(a.minY, chipRect.minY));
                totalCardObstacleOverlap += (ox * oy);
              }
            }
          }
        }

        // Measure tether lengths from SVG lines
        let maxTetherLength = 0;
        const svgLines = Array.from(document.querySelectorAll('[data-testid="label-layer"] line'));
        for (const line of svgLines) {
          const x1 = parseFloat(line.getAttribute('x1') || '0');
          const y1 = parseFloat(line.getAttribute('y1') || '0');
          const x2 = parseFloat(line.getAttribute('x2') || '0');
          const y2 = parseFloat(line.getAttribute('y2') || '0');
          const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          if (len > maxTetherLength) maxTetherLength = len;
        }

        const focusedInsideSafeRect = rects.length > 0 && rects[0].minX >= 20 && rects[0].maxX <= 1420 && rects[0].minY >= 50 && rects[0].maxY <= 840;

        return {
          cardCount: rects.length,
          totalCardCardOverlap,
          totalCardObstacleOverlap,
          maxTetherLength: Math.round(maxTetherLength),
          focusedInsideSafeRect,
        };
      })()`);
      console.log("Example-Startup Stage 4 Placement Metrics:", stage4Metrics);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Whole Route View of all 3 fixtures + Chip collision check
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Whole Route Views & Chip Collisions ---");

  // 3a. Startup whole route
  await evaluateExpr(`(() => {
    const btn = document.querySelector('[data-testid="footer-whole-route-toggle"]');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot("whole-route-startup.png");
  await saveScreenshot("whole-route-example-startup.png");
  const startupWholeRouteDebug = await getDebugNumbers();

  const chipCollisionsInWholeRoute = await evaluateExpr(`(() => {
    const chips = Array.from(document.querySelectorAll('[data-testid="stage-headers"] > div'))
      .filter(el => el.style.visibility !== 'hidden')
      .map(el => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent.trim(), minX: r.left, maxX: r.right, minY: r.top, maxY: r.bottom };
      });

    let collisionCount = 0;
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        const a = chips[i];
        const b = chips[j];
        const ox = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
        const oy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
        if (ox > 0 && oy > 0) collisionCount++;
      }
    }
    return { visibleChips: chips.length, collisionCount };
  })()`);
  console.log("Startup Whole Route Chip Collisions:", chipCollisionsInWholeRoute);

  // 3b. Demo whole route
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 4500));
  await evaluateExpr(`(() => {
    const btn = document.querySelector('[data-testid="footer-whole-route-toggle"]');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot("whole-route-demo.png");
  const demoWholeRouteDebug = await getDebugNumbers();

  // 3c. Stress whole route
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/stress-25-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 5500));
  await evaluateExpr(`(() => {
    const btn = document.querySelector('[data-testid="footer-whole-route-toggle"]');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 2000));
  await saveScreenshot("whole-route-stress.png");
  const stressWholeRouteDebug = await getDebugNumbers();

  // -------------------------------------------------------------------------
  // 4. Drawer Open
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Drawer Open View ---");
  await send("Page.navigate", {
    url: "http://localhost:3000/journey/demo-metro-synthetic?debug=1",
  });
  await new Promise((r) => setTimeout(r, 4500));
  await evaluateExpr(`(() => {
    const firstBtn = document.querySelector('[data-testid="label-layer"] [data-station-id] button');
    if (firstBtn) firstBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 1200));
  await saveScreenshot("drawer-open.png");

  // -------------------------------------------------------------------------
  // 5. Mark Done: Before, After, Undo
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Mark Done Sequence ---");
  await saveScreenshot("mark-done-before.png");

  await evaluateExpr(`(() => {
    const btn = document.querySelector('[data-testid="drawer-mark-done-btn"]');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  await saveScreenshot("mark-done-after.png");

  await evaluateExpr(`(() => {
    const undoBtn = document.querySelector('[data-testid="undo-toast-btn"]');
    if (undoBtn) undoBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  await saveScreenshot("mark-done-undo.png");

  // -------------------------------------------------------------------------
  // 6. Three Road Close-ups at Genuinely Different Distances (§11.8)
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Three Road Close-ups at Distinct Distances ---");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  const closeUpDistances = [12, 24, 40];
  const closeUpResults = [];

  for (let idx = 0; idx < closeUpDistances.length; idx++) {
    const targetDist = closeUpDistances[idx];
    await send("Page.navigate", {
      url: "http://localhost:3000/journey/demo-metro-synthetic",
    });
    await new Promise((r) => setTimeout(r, 4000));

    // Position camera at exact target distance looking at station plaza
    await evaluateExpr(`(() => {
      const controls = window.__CW_CONTROLS__;
      const az = (-15 * Math.PI) / 180;
      const pol = (52 * Math.PI) / 180;
      const u = [
        Math.sin(pol) * Math.sin(az),
        Math.cos(pol),
        Math.sin(pol) * Math.cos(az)
      ];
      const target = [0, 0.21, 0];
      const pos = [
        target[0] + ${targetDist} * u[0],
        target[1] + ${targetDist} * u[1],
        target[2] + ${targetDist} * u[2]
      ];
      if (controls && controls.setLookAt) {
        controls.setLookAt(...pos, ...target, false);
      }
    })()`);
    await new Promise((r) => setTimeout(r, 1000));

    const filename = `road-closeup-zoom${idx + 1}.png`;
    const outPath = await saveScreenshot(filename);
    const sizeBytes = fs.statSync(outPath).size;
    closeUpResults.push({
      zoom: idx + 1,
      filename,
      targetDist,
      sizeBytes,
    });
  }

  await send("Emulation.setEmulatedMedia", { features: [] });

  // -------------------------------------------------------------------------
  // Summary & Print Output
  // -------------------------------------------------------------------------
  console.log("\n========================================================");
  console.log("             STAGE FOCUS 2 CAPTURE REPORT               ");
  console.log("========================================================");

  console.log("\n--- 1. First View Metrics ---");
  for (const [fix, met] of Object.entries(fixtureFirstViews)) {
    console.log(`- ${fix}: distance = ${met.distance.toFixed(1)}, anchor inside safe rect = ${met.anchorInsideSafeRect}`);
  }

  console.log("\n--- 2. Example-Startup Stage 4 Placement Metrics ---");
  if (stage4Metrics) {
    console.log(`- Card count: ${stage4Metrics.cardCount}`);
    console.log(`- Card–Card overlap: ${stage4Metrics.totalCardCardOverlap} px²`);
    console.log(`- Card–Obstacle overlap: ${stage4Metrics.totalCardObstacleOverlap} px²`);
    console.log(`- Maximum tether length: ${stage4Metrics.maxTetherLength} px`);
    console.log(`- Focused anchor inside safe rect: ${stage4Metrics.focusedInsideSafeRect}`);
  }

  console.log("\n--- 3. Chip Collisions in Whole-Route View ---");
  console.log(`- Visible chips: ${chipCollisionsInWholeRoute.visibleChips}, Collisions: ${chipCollisionsInWholeRoute.collisionCount}`);

  console.log("\n--- 4. Road Close-Up Evidence (3 Distinct Distances) ---");
  for (const cu of closeUpResults) {
    console.log(`- Zoom ${cu.zoom} (${cu.filename}): distance = ${cu.targetDist} units, file size = ${cu.sizeBytes.toLocaleString()} bytes`);
  }

  console.log("\n--- 5. Budget Table (Whole Route Verbatim Debug Numbers) ---");
  console.log(`- Demo Whole Route: ${demoWholeRouteDebug}`);
  console.log(`- Startup Whole Route: ${startupWholeRouteDebug}`);
  console.log(`- Stress Whole Route: ${stressWholeRouteDebug}`);

  console.log("\n--- 6. Captured Screenshots ---");
  for (const file of capturedFiles) {
    console.log(`- ${file.filename} (${file.sizeBytes.toLocaleString()} bytes)`);
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
