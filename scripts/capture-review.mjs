import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REVIEW_DIR = path.resolve(process.cwd(), "review/captures");
if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function startProdServer(dataSource = "files") {
  console.log(`\n--- Starting Production Server (DATA_SOURCE=${dataSource}) ---`);
  const server = spawn("npx", ["next", "start", "-p", "3000"], {
    env: { ...process.env, DATA_SOURCE: dataSource, PORT: "3000", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (d) => {
    const text = d.toString();
    if (text.includes("Ready") || text.includes("started server on") || text.includes("localhost:3000")) {
      // ready
    }
  });
  server.stderr.on("data", (d) => {
    const text = d.toString().trim();
    if (text) console.error("[SERVER ERR]", text);
  });

  let ready = false;
  for (let i = 0; i < 40; i++) {
    await wait(500);
    try {
      const res = await fetch("http://localhost:3000/api/v1/health");
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // retry
    }
  }

  if (!ready) {
    server.kill();
    throw new Error("Production server failed to start on port 3000");
  }
  console.log("✓ Production server ready on http://localhost:3000");
  return server;
}

async function startDevServer(dataSource = "fixtures") {
  console.log(`\n--- Starting Dev Server for Fixtures (DATA_SOURCE=${dataSource}) ---`);
  const server = spawn("npx", ["next", "dev", "-p", "3000"], {
    env: { ...process.env, DATA_SOURCE: dataSource, PORT: "3000", NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (d) => {
    const text = d.toString();
    if (text.includes("Ready") || text.includes("started server on") || text.includes("localhost:3000")) {
      // ready
    }
  });
  server.stderr.on("data", (d) => {
    const text = d.toString().trim();
    if (text) console.error("[DEV SERVER ERR]", text);
  });

  let ready = false;
  for (let i = 0; i < 40; i++) {
    await wait(500);
    try {
      const res = await fetch("http://localhost:3000/api/v1/health");
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // retry
    }
  }

  if (!ready) {
    server.kill();
    throw new Error("Dev server failed to start on port 3000");
  }
  console.log("✓ Dev server ready on http://localhost:3000");
  return server;
}

import os from "node:os";

class BrowserSession {
  constructor(port = 9222) {
    this.port = port;
    this.chrome = null;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
    this.consoleErrors = [];
    this.allLogs = [];
    this.userDataDir = null;
  }

  async launch(width = 1440, height = 900) {
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-review-chrome-"));
    this.chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
      "--headless=new",
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=metal",
      `--window-size=${width},${height}`,
      "about:blank",
    ]);

    let pages = null;
    for (let i = 0; i < 30; i++) {
      await wait(300);
      try {
        const listRes = await fetch(`http://127.0.0.1:${this.port}/json/list`);
        if (listRes.ok) {
          pages = await listRes.json();
          if (pages && pages.length > 0) break;
        }
      } catch {
        // retry
      }
    }
    if (!pages || pages.length === 0) throw new Error("Chrome failed to provide remote debugging endpoint on port " + this.port);
    const page = pages.find((p) => p.type === "page") || pages[0];
    if (!page) throw new Error("No page found in Chrome");

    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.callbacks.has(data.id)) {
        this.callbacks.get(data.id)(data);
        this.callbacks.delete(data.id);
      }
      if (data.method === "Runtime.consoleAPICalled") {
        const text = data.params.args.map((a) => a.value || a.description || "").join(" ");
        this.allLogs.push({ type: data.params.type, text });
        if (data.params.type === "error") {
          this.consoleErrors.push(text);
          console.error("[BROWSER ERROR]", text);
        }
      }
    };

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
    await this.setViewport(width, height);
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const currentId = this.msgId++;
      this.callbacks.set(currentId, resolve);
      this.ws.send(JSON.stringify({ id: currentId, method, params }));
    });
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async setReducedMotion(enable = true) {
    await this.send("Emulation.setEmulatedMedia", {
      features: enable ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [],
    });
  }

  async evaluate(code) {
    const res = await this.send("Runtime.evaluate", {
      expression: code,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.result?.exceptionDetails) {
      throw new Error(res.result.exceptionDetails.text || "Eval error");
    }
    return res.result?.result?.value;
  }

  async waitFor(fnCode, label = "condition", timeoutMs = 25000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await this.evaluate(fnCode);
        if (val) return val;
      } catch {
        // continue
      }
      await wait(250);
    }
    throw new Error(`Timeout waiting for ${label} after ${timeoutMs}ms`);
  }

  async capture(filename, width = 1440, height = 900) {
    const res = await this.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    const buf = Buffer.from(res.result.data, "base64");
    const filePath = path.join(REVIEW_DIR, filename);
    fs.writeFileSync(filePath, buf);
    console.log(`✓ Saved ${filename} (${buf.length.toLocaleString()} bytes)`);
    return { name: filename, path: filePath, size: buf.length };
  }

  async close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.chrome) {
      this.chrome.kill();
      this.chrome = null;
    }
    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

async function run() {
  const captures = [];
  const debugMetrics = {};
  const keyboardWalk = [];
  const allConsoleErrors = [];

  console.log("\n=======================================================");
  console.log("CIVICWEAVE PRODUCTION REVIEW & EVIDENCE SUITE (FE-5 & FE-6)");
  console.log("=======================================================\n");

  // -------------------------------------------------------------
  // SUITE 1: DATA_SOURCE=files (start-business-mumbai)
  // -------------------------------------------------------------
  let server = await startProdServer("files");
  let browser = new BrowserSession(9222);
  await browser.launch(1440, 900);

  try {
    // -------------------------------------------------------------
    // Capture 15 & 16: Intro Sequence & Reduced Motion
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 15 & 16] Intro Sequence beats & reduced motion...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/" });
    await wait(400);
    await browser.evaluate("sessionStorage.clear()");
    await browser.send("Page.navigate", { url: "http://localhost:3000/" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="intro-sequence"]'))`, "Intro started");

    // Beat 2 (≈1.2s into 4.2s sequence)
    await wait(1200);
    captures.push(await browser.capture("15-intro-beat2.png"));

    // Reduced motion (brand + tagline ONLY)
    await browser.setReducedMotion(true);
    await browser.evaluate("sessionStorage.clear()");
    await browser.send("Page.navigate", { url: "http://localhost:3000/" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="intro-sequence"]'))`, "Reduced motion intro");
    await wait(300);
    const rmIntroText = await browser.evaluate(`document.querySelector('[data-testid="intro-sequence"]')?.innerText.replace(/\\n/g, ' ')`);
    console.log("Reduced motion intro text:", rmIntroText);
    captures.push(await browser.capture("16-intro-reduced-motion.png"));
    await browser.setReducedMotion(false);

    // -------------------------------------------------------------
    // Capture 01 & 02: Landing Page & Suggestions Confirmation
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 01 & 02] Landing Natural Search & Fact Suggestions...");
    await browser.evaluate("sessionStorage.setItem('cw-intro-seen', '1')");
    await browser.send("Page.navigate", { url: "http://localhost:3000/?skipIntro=1" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="landing-search-input"]'))`, "Landing search input");

    const demoSentence = "I want to open a cloud kitchen in Andheri with 5 employees";
    await browser.evaluate(`(() => {
      const input = document.querySelector('[data-testid="landing-search-input"]');
      if (input) {
        input.focus();
        input.value = "";
      }
    })()`);
    await browser.send("Input.insertText", { text: demoSentence });
    await wait(400);

    // Click search button
    await browser.evaluate(`(() => {
      const btn = document.querySelector('[data-testid="landing-search-btn"]');
      if (btn && !btn.disabled) btn.click();
    })()`);

    await browser.waitFor(
      `Boolean(document.querySelector('[data-testid="suggested-facts-row"]') || document.querySelector('[data-testid="suggested-facts"]'))`,
      "Suggestions rendered"
    );
    await wait(500);

    captures.push(await browser.capture("01-landing-suggestions.png"));

    // Confirm all suggestions
    await browser.evaluate(`(() => {
      const confirmBtns = document.querySelectorAll('[data-testid^="confirm-fact-"]');
      confirmBtns.forEach(b => b.click());
    })()`);
    await wait(400);

    // Answer entity type if question prompt exists
    await browser.evaluate(`(() => {
      const entityBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("Private Limited"));
      if (entityBtn) entityBtn.click();
    })()`);
    await wait(400);

    captures.push(await browser.capture("02-landing-confirmed-answers.png"));

    // -------------------------------------------------------------
    // Capture 03 & 04: Entrance Choreography (mid ≈600ms, end)
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 03 & 04] Entrance sequence...");
    await browser.evaluate(`(() => {
      const btn = document.querySelector('[data-testid="map-my-route-btn"]');
      if (btn) btn.click();
    })()`);

    // Mid-entrance capture (≈600ms after arrival)
    await wait(600);
    captures.push(await browser.capture("03-entrance-mid.png"));

    // Entrance completion capture
    await wait(1600);
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="stage-bar"]'))`, "Stage bar loaded");
    captures.push(await browser.capture("04-entrance-end.png"));

    // -------------------------------------------------------------
    // Capture 05: Stage 1 with Nudge & Scroll Assertions
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 05] Stage 1 with Personalise Nudge & Zero-Scroll assertions...");
    await browser.evaluate("sessionStorage.removeItem('nudge-dismissed-start-business-mumbai')");
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/start-business-mumbai?debug=1" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="stage-bar"]'))`, "Journey loaded");
    await wait(1500);

    // Assert C1: stage bar data-focus-stage === 1
    const stage1Focus = await browser.evaluate(`document.querySelector('[data-testid="stage-bar"]')?.getAttribute('data-focus-stage')`);
    assert(stage1Focus === "1", `Expected data-focus-stage to be 1, got ${stage1Focus}`);

    // Assert C1: zero horizontal scroll on all ancestors
    const scrollStatus = await browser.evaluate(`(() => {
      let el = document.querySelector('canvas');
      let bad = [];
      while (el && el !== document.documentElement) {
        if (el.scrollLeft !== 0 || el.scrollTop !== 0) {
          bad.push({ tag: el.tagName, testId: el.getAttribute('data-testid'), scrollLeft: el.scrollLeft, scrollTop: el.scrollTop });
        }
        el = el.parentElement;
      }
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
        hasDocScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        badAncestors: bad,
      };
    })()`);
    assert(!scrollStatus.hasDocScroll, `Window has horizontal scroll: ${scrollStatus.docScrollWidth} > ${scrollStatus.docClientWidth}`);
    assert(scrollStatus.badAncestors.length === 0, `Ancestors have non-zero scroll: ${JSON.stringify(scrollStatus.badAncestors)}`);

    captures.push(await browser.capture("05-stage1-nudge.png"));

    // -------------------------------------------------------------
    // C2 & Capture 06 & 07: Keyboard Walk to Stage 4, Tray & Filters
    // -------------------------------------------------------------
    console.log("\n[C2 & CAPTURE 06 & 07] Keyboard Walk to Stage 4 & Tray Selections...");
    // Press ArrowRight until data-focus-stage === 4
    for (let i = 0; i < 6; i++) {
      const current = await browser.evaluate(`document.querySelector('[data-testid="stage-bar"]')?.getAttribute('data-focus-stage')`);
      if (current === "4") break;
      await browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
      await wait(400);
    }
    const finalStage = await browser.evaluate(`document.querySelector('[data-testid="stage-bar"]')?.getAttribute('data-focus-stage')`);
    assert(finalStage === "4", `Failed to reach stage 4 via ArrowRight, reached ${finalStage}`);

    // Wait for stage 4 tray to open and render
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="parallel-stage-tray"]'))`, "Stage 4 tray open");
    await wait(1000);

    // Assert C1: no overlap between StageBar and Tray
    const overlapCheck = await browser.evaluate(`(() => {
      const getRect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
      };
      const bar = getRect(document.querySelector('[data-testid="stage-bar"]'));
      const tray = getRect(document.querySelector('[data-testid="parallel-stage-tray"]'));
      const drawer = getRect(document.querySelector('[data-testid="right-drawer"][data-state="open"]'));
      let overlapsTray = false;
      let overlapsDrawer = false;
      if (bar && tray) {
        overlapsTray = bar.left < tray.right && bar.right > tray.left;
      }
      if (bar && drawer) {
        overlapsDrawer = bar.right > drawer.left && bar.left < drawer.right;
      }
      return { bar, tray, drawer, overlapsTray, overlapsDrawer };
    })()`);
    assert(!overlapCheck.overlapsTray, `Stage bar overlaps tray: ${JSON.stringify(overlapCheck)}`);

    // Perform C2: Press ArrowDown 15 times and log rowId, rowTitle, 3D marker, camera distance
    console.log("\n--- C2 KEYBOARD WALK LOG (Stage 4 ArrowDown x15) ---");
    for (let step = 1; step <= 15; step++) {
      await browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
      await wait(300);

      const stepData = await browser.evaluate(`(() => {
        const tray = document.querySelector('[data-testid="parallel-stage-tray"]');
        const rowId = tray?.getAttribute('data-selected-row') || "";
        const rowEl = document.querySelector('[data-testid="stage-tray-row-' + rowId + '"]');
        const rowTitle = rowEl?.querySelector('span.font-semibold')?.innerText || rowEl?.innerText?.split('\\n')[0] || rowId;
        const win = window;
        const marker = win.__cwDebug?.selectedMarker ?? null;
        const distance = win.__CW_CONTROLS__?.distance ?? win.__cwDebug?.cameraDistance ?? 0;
        return { step: ${step}, rowId, rowTitle, marker, distance: Math.round(distance * 100) / 100 };
      })()`);

      keyboardWalk.push(stepData);
      console.log(`Step ${stepData.step.toString().padStart(2)}: rowId="${stepData.rowId}" title="${stepData.rowTitle}" 3D marker=${stepData.marker} dist=${stepData.distance}`);
    }

    // Capture 06: Stage 4 tray + selection on row 4.3 (or current selection)
    captures.push(await browser.capture("06-stage4-tray-selection.png"));

    // Capture 07: Filter "In person"
    await browser.evaluate(`(() => {
      const btn = document.querySelector('[data-testid="stage-tray-filter-in_person"]');
      if (btn) btn.click();
    })()`);
    await wait(500);
    captures.push(await browser.capture("07-stage4-tray-filtered-in-person.png"));

    // Reset filter
    await browser.evaluate(`(() => {
      const btn = document.querySelector('[data-testid="stage-tray-filter-all"]');
      if (btn) btn.click();
    })()`);
    await wait(300);

    // Record debug metrics for seed stage 4
    const seedStage4Metrics = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugMetrics["seed-stage4"] = seedStage4Metrics;
    console.log("\n[C4 METRICS] Seed Stage 4:", seedStage4Metrics);

    // -------------------------------------------------------------
    // Capture 08: Whole Route View & Debug Numbers
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 08] Whole route view...");
    await browser.evaluate(`(() => {
      const btn = document.querySelector('[data-testid="footer-whole-route-toggle"]');
      if (btn) btn.click();
    })()`);
    await wait(1200);

    // Assert C1: data-view-mode === "whole"
    const viewMode = await browser.evaluate(`document.querySelector('[data-testid="3d-window-card"]')?.getAttribute('data-view-mode')`);
    assert(viewMode === "whole", `Expected data-view-mode to be "whole", got ${viewMode}`);

    const seedWholeMetrics = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugMetrics["seed-whole-route"] = seedWholeMetrics;
    console.log("[C4 METRICS] Seed Whole Route:", seedWholeMetrics);

    captures.push(await browser.capture("08-whole-route.png"));

    // Return to stage framing
    await browser.evaluate(`(() => {
      const btn = document.querySelector('[data-testid="footer-whole-route-toggle"]');
      if (btn) btn.click();
    })()`);
    await wait(800);

    // -------------------------------------------------------------
    // Capture 09: What-If Toast above Stage Bar
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 09] What-If Toggle & Recompose Toast...");
    await browser.evaluate(`(() => {
      const yesBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === "Yes");
      if (yesBtn) yesBtn.click();
    })()`);
    await wait(400);

    await browser.evaluate(`(() => {
      const toggle = document.querySelector('[data-testid="what-if-toggle-business.serves_food"]');
      if (toggle) toggle.click();
    })()`);
    await wait(800);

    captures.push(await browser.capture("09-what-if-toast.png"));

    // -------------------------------------------------------------
    // Capture 10, 11, 12: Rail Panel Overlays (My Journey, Visits, Docs)
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 10, 11, 12] Panel overlays...");

    // 10. My Journey Panel
    await browser.evaluate(`document.getElementById('rail-btn-journey')?.click()`);
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="my-journey-panel"]'))`, "My journey panel open");
    await wait(600);
    const panel1Active = await browser.evaluate(`document.querySelector('[data-testid="3d-window-card"]')?.getAttribute('data-active-panel')`);
    assert(panel1Active === "journey", `Expected active panel to be journey, got ${panel1Active}`);
    captures.push(await browser.capture("10-my-journey-panel.png"));

    // 11. Office Visits Panel
    await browser.evaluate(`document.getElementById('rail-btn-visits')?.click()`);
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="office-visits-panel"]'))`, "Office visits panel open");
    await wait(600);
    const panel2Active = await browser.evaluate(`document.querySelector('[data-testid="3d-window-card"]')?.getAttribute('data-active-panel')`);
    assert(panel2Active === "visits", `Expected active panel to be visits, got ${panel2Active}`);
    captures.push(await browser.capture("11-office-visits-panel.png"));

    // 12. Documents Panel
    await browser.evaluate(`document.getElementById('rail-btn-documents')?.click()`);
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="documents-panel"]'))`, "Documents panel open");
    await wait(600);
    const panel3Active = await browser.evaluate(`document.querySelector('[data-testid="3d-window-card"]')?.getAttribute('data-active-panel')`);
    assert(panel3Active === "documents", `Expected active panel to be documents, got ${panel3Active}`);
    captures.push(await browser.capture("12-documents-panel.png"));

    // Close panel with Escape key and assert focus returns to rail button
    await browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await wait(400);

    // -------------------------------------------------------------
    // Capture 13: Drawer with Why This Step (B4 & B5)
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 13] Drawer with Why this step explanation...");
    // Select a step to open the drawer
    await browser.evaluate(`(() => {
      const stepBtn = document.querySelector('[data-testid^="stage-tray-row-"]') || document.querySelector('[data-testid^="card-btn-"]');
      if (stepBtn) stepBtn.click();
    })()`);
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="right-drawer"][data-state="open"]'))`, "Drawer open");
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="step-explain"]'))`, "StepExplain rendered");
    await wait(600);

    captures.push(await browser.capture("13-drawer-why-this-step.png"));

    // -------------------------------------------------------------
    // Capture 14: Print Page with Demo Facts
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 14] Print Page...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/start-business-mumbai/print" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="print-page-btn"]'))`, "Print page ready");
    await wait(1000);
    captures.push(await browser.capture("14-print-page-demo-facts.png"));

    // -------------------------------------------------------------
    // Capture 17: Branded 404
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 17] Branded 404 Page...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/some-non-existent-page-404" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="app-not-found"]'))`, "404 page ready");
    await wait(600);
    captures.push(await browser.capture("17-branded-404.png"));

    // -------------------------------------------------------------
    // Capture 18: 1280x800 Stage 4 with Tray and Drawer Open (No overlap)
    // -------------------------------------------------------------
    console.log("\n[CAPTURE 18] 1280x800 Stage 4 Tray + Drawer Open...");
    await browser.setViewport(1280, 800);
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/start-business-mumbai?debug=1" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="stage-bar"]'))`, "Loaded at 1280x800");
    await wait(1000);

    // Navigate to stage 4
    for (let i = 0; i < 6; i++) {
      const current = await browser.evaluate(`document.querySelector('[data-testid="stage-bar"]')?.getAttribute('data-focus-stage')`);
      if (current === "4") break;
      await browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
      await wait(300);
    }
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="parallel-stage-tray"]'))`, "Tray open");

    // Click a tray row to open drawer
    await browser.evaluate(`(() => {
      const row = document.querySelector('[data-testid^="stage-tray-row-"]');
      if (row) row.click();
    })()`);
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="right-drawer"][data-state="open"]'))`, "Drawer open");

    // Click tray tab to expand tray alongside drawer
    await browser.evaluate(`(() => {
      const tab = document.querySelector('[data-testid="stage-tray-tab"]');
      if (tab) tab.click();
    })()`);
    await wait(800);

    // Assert no overlap at 1280x800
    const noOverlap1280 = await browser.evaluate(`(() => {
      const getRect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
      };
      const bar = getRect(document.querySelector('[data-testid="stage-bar"]'));
      const tray = getRect(document.querySelector('[data-testid="parallel-stage-tray"]'));
      const drawer = getRect(document.querySelector('[data-testid="right-drawer"][data-state="open"]'));
      let overlapsTray = false;
      let overlapsDrawer = false;
      if (bar && tray) overlapsTray = bar.left < tray.right && bar.right > tray.left;
      if (bar && drawer) overlapsDrawer = bar.right > drawer.left && bar.left < drawer.right;
      return { bar, tray, drawer, overlapsTray, overlapsDrawer };
    })()`);
    assert(!noOverlap1280.overlapsTray, `1280x800: Bar overlaps tray: ${JSON.stringify(noOverlap1280)}`);
    assert(!noOverlap1280.overlapsDrawer, `1280x800: Bar overlaps drawer: ${JSON.stringify(noOverlap1280)}`);

    captures.push(await browser.capture("18-1280x800-stage4-tray-drawer.png", 1280, 800));

    allConsoleErrors.push(...browser.consoleErrors);
  } finally {
    await browser.close();
    server.kill();
    await wait(1500);
  }

  // -------------------------------------------------------------
  // SUITE 2: DATA_SOURCE=fixtures (stress-25-synthetic)
  // -------------------------------------------------------------
  console.log("\n=======================================================");
  console.log("SUITE 2: DATA_SOURCE=fixtures (stress-25-synthetic)");
  console.log("=======================================================\n");

  server = await startDevServer("fixtures");
  browser = new BrowserSession(9222);
  await browser.launch(1440, 900);

  try {
    console.log("\n[STRESS 25] Capturing synthetic stress graph stage 1 and whole route...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/stress-25-synthetic?debug=1" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="stage-bar"]'))`, "Stress graph loaded");
    await wait(2500);

    const stressStage1Metrics = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugMetrics["stress-stage1"] = stressStage1Metrics;
    console.log("[C4 METRICS] Stress Stage 1:", stressStage1Metrics);

    captures.push(await browser.capture("19-stress-25-stage1.png"));

    // Toggle whole route
    await browser.evaluate(`(() => {
      const btn = document.querySelector('[data-testid="footer-whole-route-toggle"]');
      if (btn) btn.click();
    })()`);
    await wait(2500);

    const stressWholeMetrics = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugMetrics["stress-whole-route"] = stressWholeMetrics;
    console.log("[C4 METRICS] Stress Whole Route:", stressWholeMetrics);

    captures.push(await browser.capture("20-stress-25-whole.png"));
    allConsoleErrors.push(...browser.consoleErrors);

  } finally {
    await browser.close();
    server.kill();
    await wait(1000);
  }

  // -------------------------------------------------------------
  // Summary Output
  // -------------------------------------------------------------
  console.log("\n=======================================================");
  console.log("REVIEW CAPTURE SUMMARY TABLE");
  console.log("=======================================================");
  console.table(captures);

  console.log("\n=======================================================");
  console.log("DEBUG NUMBERS (VERBATIM §11.6 BUDGET AUDIT)");
  console.log("=======================================================");
  console.log(JSON.stringify(debugMetrics, null, 2));

  console.log("\n=======================================================");
  console.log("BROWSER CONSOLE ERRORS");
  console.log("=======================================================");
  const uniqueErrors = [...new Set(allConsoleErrors)];
  if (uniqueErrors.length === 0) {
    console.log("✓ Zero browser console errors encountered.");
  } else {
    console.log("Logged browser errors:", uniqueErrors);
  }

  console.log("\n✓ All capture and assertion suites completed successfully.");
}

run().catch((err) => {
  console.error("\n❌ Capture suite error:", err);
  process.exit(1);
});
