import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REVIEW_DIR = path.resolve(process.cwd(), "review/overnight");
if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startServer(dataSource = "files") {
  console.log(`\n--- Starting Next.js Dev Server (DATA_SOURCE=${dataSource}) ---`);
  const server = spawn("npx", ["next", "dev", "-p", "3000"], {
    env: { ...process.env, DATA_SOURCE: dataSource, PORT: "3000" },
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

  // Poll until responsive
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

class BrowserSession {
  constructor(port = 9222) {
    this.port = port;
    this.chrome = null;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
    this.consoleLogs = [];
  }

  async launch(width = 1440, height = 900) {
    this.chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
      "--headless=new",
      `--remote-debugging-port=${this.port}`,
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=metal",
      `--window-size=${width},${height}`,
      "about:blank",
    ]);

    await wait(1800);
    const listRes = await fetch(`http://127.0.0.1:${this.port}/json/list`);
    const pages = await listRes.json();
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
        if (data.params.type === "error") {
          console.error("[BROWSER ERROR]", text);
        }
        this.consoleLogs.push({ type: data.params.type, text });
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
    console.log(`✓ Captured ${filename} (${buf.length} bytes)`);
    return { path: filePath, size: buf.length };
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
  }
}

async function run() {
  const capturedFiles = [];
  const debugNumbers = {};
  const keyboardWalkLog = [];
  let landingReport = {};

  // =========================================================================
  // SUITE 1: DATA_SOURCE=files
  // =========================================================================
  let server = await startServer("files");
  let browser = new BrowserSession();
  await browser.launch(1440, 900);

  try {
    // -------------------------------------------------------------
    // Scroll Check: 1440x900 and 1280x800 on / and /journey/start-business-mumbai
    // -------------------------------------------------------------
    console.log("\n[VERIFY] Checking Page Scroll at 1440x900 and 1280x800...");
    for (const size of [{ w: 1440, h: 900 }, { w: 1280, h: 800 }]) {
      await browser.setViewport(size.w, size.h);
      await browser.send("Page.navigate", { url: "http://localhost:3000/?skipIntro=1" });
      await browser.waitFor(`document.readyState === "complete"`, "Landing page ready");
      await wait(1000);
      const landingScroll = await browser.evaluate(`({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        hasHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        hasVertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      })`);
      console.log(`Landing at ${size.w}x${size.h}: horizontal=${landingScroll.hasHorizontal}, vertical=${landingScroll.hasVertical}`);

      await browser.send("Page.navigate", { url: "http://localhost:3000/journey/start-business-mumbai?debug=1" });
      await browser.waitFor(`Boolean(document.querySelector('canvas') || document.querySelector('[data-testid="stage-bar"]'))`, "Journey ready");
      await wait(1500);
      const journeyScroll = await browser.evaluate(`({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        hasHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        hasVertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      })`);
      console.log(`Journey at ${size.w}x${size.h}: horizontal=${journeyScroll.hasHorizontal}, vertical=${journeyScroll.hasVertical}`);
    }

    // Reset to 1440x900
    await browser.setViewport(1440, 900);

    // -------------------------------------------------------------
    // Item 6: Intro Frames (b2, b6, b9) and Reduced-Motion frame
    // -------------------------------------------------------------
    console.log("\n[ITEM 6] Intro Frames capture...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/" });
    await wait(500);
    await browser.evaluate("sessionStorage.clear()");
    await browser.send("Page.navigate", { url: "http://localhost:3000/" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="intro-sequence"]'))`, "Intro started");

    // Capture b2 (around 1.2s into timeline)
    await wait(1200);
    capturedFiles.push(await browser.capture("09-intro-b2.png"));

    // Capture b6 (around 2.9s into timeline)
    await wait(1700);
    capturedFiles.push(await browser.capture("10-intro-b6.png"));

    // Capture b9 (around 4.2s into timeline)
    await wait(1300);
    capturedFiles.push(await browser.capture("11-intro-b9.png"));

    // Reduced motion frame
    await browser.setReducedMotion(true);
    await browser.evaluate("sessionStorage.clear()");
    await browser.send("Page.navigate", { url: "http://localhost:3000/" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="intro-sequence"]'))`, "Reduced motion intro");
    await wait(300);
    capturedFiles.push(await browser.capture("12-intro-reduced-motion.png"));
    await browser.setReducedMotion(false);

    // -------------------------------------------------------------
    // Item 1: Landing Natural Language Search & Suggestions
    // -------------------------------------------------------------
    console.log("\n[ITEM 1] Landing Natural Search & Entrance...");
    await browser.evaluate("sessionStorage.setItem('cw-intro-seen', '1')");
    await browser.send("Page.navigate", { url: "http://localhost:3000/?skipIntro=1" });
    await wait(1500);
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="landing-search-input"]'))`, "Landing search input");

    const demoSentence = "I want to open a cloud kitchen in Andheri with 5 employees";
    await browser.evaluate(`(() => {
      const input = document.querySelector('[data-testid="landing-search-input"]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, "${demoSentence}");
        if (input._valueTracker) {
          input._valueTracker.setValue("");
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await wait(300);
    await browser.evaluate(`(() => {
      const btn = document.querySelector('[data-testid="landing-search-btn"]');
      if (btn && !btn.disabled) {
        btn.click();
      }
    })()`);

    await browser.waitFor(
      `Boolean(document.querySelector('[data-testid="suggested-facts-row"]') || document.querySelector('[data-testid="suggested-facts"]'))`,
      "Suggestions rendered"
    );
    await wait(600);

    landingReport = await browser.evaluate(`(() => {
      const mode = document.querySelector('[data-testid="search-mode-indicator"]')?.innerText || "lexical_fallback";
      const chips = Array.from(document.querySelectorAll('[data-testid^="suggested-chip-"]')).map(el => el.innerText.replace(/\\n/g, ' '));
      return { mode, chips };
    })()`);
    console.log("Landing suggestions:", landingReport);

    capturedFiles.push(await browser.capture("01-landing-suggestions.png"));

    // Confirm suggestions
    await browser.evaluate(`(() => {
      const confirmBtns = document.querySelectorAll('[data-testid^="confirm-fact-"]');
      confirmBtns.forEach(b => b.click());
    })()`);
    await wait(500);

    // Click "Map my route" and capture entrance
    await browser.evaluate(`(() => {
      const btn = document.querySelector('[data-testid="map-my-route-btn"]');
      if (btn) btn.click();
    })()`);

    // Mid-way entrance capture (around 700ms into 1.6s animation)
    await wait(700);
    capturedFiles.push(await browser.capture("02-entrance-mid.png"));

    // Entrance completion capture
    await wait(1800);
    capturedFiles.push(await browser.capture("03-entrance-end.png"));

    // -------------------------------------------------------------
    // Item 2: Journey Stage 1 & Personalise-First Nudge
    // -------------------------------------------------------------
    console.log("\n[ITEM 2] Journey Stage 1 & Personalise Nudge...");
    await browser.evaluate("sessionStorage.removeItem('nudge-dismissed-start-business-mumbai')");
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/start-business-mumbai?debug=1&stage=1" });
    await browser.waitFor(`Boolean(document.querySelector('canvas') || document.querySelector('[data-testid="stage-bar"]'))`, "Journey loaded");
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="personalise-nudge"]'))`, "Personalise nudge");
    await wait(1000);
    capturedFiles.push(await browser.capture("04-stage1-nudge.png"));

    // Answer entity type
    await browser.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-testid="personalise-nudge"] button')).find(b => b.innerText.includes("Private Limited"));
      if (btn) btn.click();
    })()`);
    await wait(800);
    capturedFiles.push(await browser.capture("05-stage1-answered.png"));

    // -------------------------------------------------------------
    // Item 3: Stage 4 Full Keyboard Walk & Debug Overlays
    // -------------------------------------------------------------
    console.log("\n[ITEM 3] Stage 4 Full Keyboard Walk...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/start-business-mumbai?debug=1&stage=4" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="stage-bar"]'))`, "Stage 4 ready");
    await wait(2000);

    // Record initial stage 4 metrics
    const stage4Metrics = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugNumbers["start-business-mumbai-stage4"] = stage4Metrics;
    console.log("Start-business-mumbai Stage 4 Debug:", stage4Metrics);

    // Keyboard walk across stage 4 stations using ArrowDown
    for (let step = 1; step <= 10; step++) {
      await browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
      await wait(300);

      const info = await browser.evaluate(`(() => {
        const bar = document.querySelector('[data-testid="stage-bar"]')?.getBoundingClientRect();
        const chip = document.querySelector('[data-testid="focused-stage-chip"]')?.getBoundingClientRect();
        const selected = document.querySelector('[data-testid="selected-station-title"]')?.innerText ||
                         document.querySelector('[data-testid^="tray-station-row-"][data-state="selected"]')?.innerText || "step " + ${step};
        return {
          step: ${step},
          selected,
          barRect: bar ? { x: Math.round(bar.x), y: Math.round(bar.y), w: Math.round(bar.width), h: Math.round(bar.height) } : null,
          chipRect: chip ? { x: Math.round(chip.x), y: Math.round(chip.y), w: Math.round(chip.width), h: Math.round(chip.height) } : null,
        };
      })()`);
      keyboardWalkLog.push(info);
    }
    capturedFiles.push(await browser.capture("06-stage4-keyboard-walk.png"));

    // Whole route debug metrics for start-business-mumbai
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/start-business-mumbai?debug=1&stage=all" });
    await wait(2500);
    const wholeMetrics = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugNumbers["start-business-mumbai-whole"] = wholeMetrics;
    console.log("Start-business-mumbai Whole Route Debug:", wholeMetrics);

    // -------------------------------------------------------------
    // Item 4: What-If Toggle serves_food & Toast
    // -------------------------------------------------------------
    console.log("\n[ITEM 4] What-If Toggle & Toast...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/start-business-mumbai?debug=1" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="what-if-panel"]'))`, "What-if panel");
    await wait(1000);

    // Toggle serves_food in What-If panel
    await browser.evaluate(`(() => {
      let toggle = document.querySelector('[data-testid="what-if-toggle-business.serves_food"]');
      if (!toggle) {
        // If not yet answered, find it in Key Questions and answer Yes first
        const allButtons = Array.from(document.querySelectorAll('button'));
        const yesBtn = allButtons.find(b => b.innerText.trim() === "Yes");
        if (yesBtn) yesBtn.click();
      }
    })()`);
    await wait(400);
    await browser.evaluate(`(() => {
      const toggle = document.querySelector('[data-testid="what-if-toggle-business.serves_food"]');
      if (toggle) toggle.click();
    })()`);
    await wait(800);
    capturedFiles.push(await browser.capture("07-whatif-toggle.png"));

    // -------------------------------------------------------------
    // Item 5: Print Checklist Page
    // -------------------------------------------------------------
    console.log("\n[ITEM 5] Print Checklist Page...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/start-business-mumbai/print" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="print-page-btn"]'))`, "Print page ready");
    await wait(1000);
    capturedFiles.push(await browser.capture("08-print-checklist.png"));

    // -------------------------------------------------------------
    // Item 7: Branded 404 Page
    // -------------------------------------------------------------
    console.log("\n[ITEM 7] Branded 404 Page...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/some-non-existent-route-404" });
    await browser.waitFor(`Boolean(document.querySelector('[data-testid="app-not-found"]'))`, "Branded 404 ready");
    await wait(800);
    capturedFiles.push(await browser.capture("13-branded-404.png"));

  } finally {
    await browser.close();
    server.kill();
    await wait(1500);
  }

  // =========================================================================
  // SUITE 2: DATA_SOURCE=fixtures (example-startup and stress-25-synthetic)
  // =========================================================================
  console.log("\n=== Switching to DATA_SOURCE=fixtures ===");
  server = await startServer("fixtures");
  browser = new BrowserSession();
  await browser.launch(1440, 900);

  try {
    // 14 & 15: example-startup (stage view and whole route)
    console.log("\n[FIXTURES] example-startup in stage view and whole route...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/example-startup?debug=1&stage=1" });
    await browser.waitFor(`Boolean(document.querySelector('canvas') || document.querySelector('[data-testid="stage-bar"]'))`, "example-startup stage 1");
    await wait(2500);
    const exStageDebug = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugNumbers["example-startup-stage"] = exStageDebug;
    capturedFiles.push(await browser.capture("14-example-startup-stage.png"));

    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/example-startup?debug=1&stage=all" });
    await wait(2500);
    const exWholeDebug = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugNumbers["example-startup-whole"] = exWholeDebug;
    capturedFiles.push(await browser.capture("15-example-startup-whole.png"));

    // 16 & 17: stress-25-synthetic (stage view and whole route)
    console.log("\n[FIXTURES] stress-25-synthetic in stage view and whole route...");
    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/stress-25-synthetic?debug=1&stage=1" });
    await browser.waitFor(`Boolean(document.querySelector('canvas') || document.querySelector('[data-testid="stage-bar"]'))`, "stress stage 1");
    await wait(2500);
    const stressStageDebug = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugNumbers["stress-25-synthetic-stage"] = stressStageDebug;
    capturedFiles.push(await browser.capture("16-stress-stage.png"));

    await browser.send("Page.navigate", { url: "http://localhost:3000/journey/stress-25-synthetic?debug=1&stage=all" });
    await wait(2500);
    const stressWholeDebug = await browser.evaluate(`(() => {
      const el = document.querySelector('[data-testid="debug-overlay"]');
      return el ? el.innerText.replace(/\\n/g, ' ') : "N/A";
    })()`);
    debugNumbers["stress-25-synthetic-whole"] = stressWholeDebug;
    capturedFiles.push(await browser.capture("17-stress-whole.png"));

  } finally {
    await browser.close();
    server.kill();
    await wait(1000);
  }

  // Save report data
  const summaryReport = {
    capturedFiles,
    debugNumbers,
    keyboardWalkLog,
    landingReport,
  };
  fs.writeFileSync(path.join(REVIEW_DIR, "overnight-summary.json"), JSON.stringify(summaryReport, null, 2));
  console.log("\n=== Overnight Verification & Capture Completed Successfully ===");
}

run().catch((err) => {
  console.error("FATAL ERROR in overnight capture:", err);
  process.exit(1);
});
