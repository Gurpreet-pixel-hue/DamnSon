import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REVIEW_DIR = path.resolve(process.cwd(), ".next/claude-review/fe-4-fixes");
if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

const CHROME_PATH =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runCapture() {
  console.log("=== Starting FE-4 Fixes Review Capture ===");
  console.log(`Review Directory: ${REVIEW_DIR}`);

  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9239",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=metal",
    "--window-size=1440,900",
    "about:blank",
  ]);

  await new Promise((r) => setTimeout(r, 2500));

  try {
    const listRes = await fetch("http://localhost:9239/json/list");
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
        if (type === "error" || type === "warning") {
          console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
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

    const capturedFiles = [];

    async function saveScreenshot(filename) {
      const res = await send("Page.captureScreenshot", { format: "png" });
      const buffer = Buffer.from(res.result.data, "base64");
      const outPath = path.join(REVIEW_DIR, filename);
      fs.writeFileSync(outPath, buffer);
      const sizeBytes = fs.statSync(outPath).size;
      capturedFiles.push({ filename, path: outPath, sizeBytes });
      console.log(`Saved screenshot: ${filename} (${sizeBytes.toLocaleString()} bytes)`);
      if (sizeBytes < 15000) {
        console.error(`[WARNING] ${filename} is suspiciously small (${sizeBytes} bytes)! Check if it is a 404!`);
      }
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

    async function navigate(url) {
      await send("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, 2000));
    }

    async function setViewport(width, height) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await new Promise((r) => setTimeout(r, 300));
    }

    const dataSourceMode = process.env.CAPTURE_MODE || "files";

    if (dataSourceMode === "files") {
      console.log("\n--- Part A: Testing Real Journeys (DATA_SOURCE=files) ---");

      // 1. start-business-mumbai
      await setViewport(1440, 900);
      await navigate(`${BASE_URL}/journey/start-business-mumbai`);
      await new Promise((r) => setTimeout(r, 1000));

      // Get Summary Bar Tile Texts with no facts set
      const summaryBarMetrics = await evaluateExpr(`(() => {
        const feeVal = document.querySelector('[data-testid="summary-tile-fees"] .font-bold')?.innerText;
        const feeSub = document.querySelector('[data-testid="summary-tile-fees"] .text-\\[10px\\]')?.innerText;
        const timeVal = document.querySelector('[data-testid="summary-tile-time"] .font-bold')?.innerText;
        const timeSub = document.querySelector('[data-testid="summary-tile-time"] .text-\\[10px\\]')?.innerText;
        return { feeVal, feeSub, timeVal, timeSub };
      })()`);
      console.log("\n==========================================");
      console.log("INITIAL SUMMARY TILES (no facts set):", summaryBarMetrics);
      console.log("==========================================");

      // Select SPICe+ step explicitly (mca-spice-plus.file) and switch to Stage 2
      await evaluateExpr(`(() => {
        // Switch to stage 2
        const dot = document.querySelector('[data-testid="stepper-dot-2"]');
        if (dot) dot.click();
        // Select step
        const taskStore = window.__ZUSTAND_TASK_STORE__;
        const viewStore = window.__ZUSTAND_VIEW_STORE__;
        // Select via click or dispatch
        const stepCard = document.querySelector('[data-station-id="mca-spice-plus.file"] button') ||
          document.querySelector('[data-station-id="mca-spice-plus.file"]');
        if (stepCard) stepCard.click();
      })()`);
      await new Promise((r) => setTimeout(r, 600));

      // Ensure drawer is open on SPICe+
      await evaluateExpr(`(() => {
        const stepButtons = Array.from(document.querySelectorAll('[data-station-id]'));
        const spice = stepButtons.find(b => b.getAttribute('data-station-id') === 'mca-spice-plus.file');
        if (spice) {
          const btn = spice.querySelector('button') || spice;
          btn.click();
        }
      })()`);
      await new Promise((r) => setTimeout(r, 600));

      // Tab 1: Overview
      await evaluateExpr(`document.querySelector('[data-testid="drawer-tab-overview"]')?.click()`);
      await new Promise((r) => setTimeout(r, 300));
      await saveScreenshot("01-start-business-spice-overview.png");

      // Tab 2: Documents
      await evaluateExpr(`document.querySelector('[data-testid="drawer-tab-documents"]')?.click()`);
      await new Promise((r) => setTimeout(r, 300));
      await saveScreenshot("02-start-business-spice-documents.png");

      // Tab 3: Fees & SLA
      await evaluateExpr(`document.querySelector('[data-testid="drawer-tab-fees"]')?.click()`);
      await new Promise((r) => setTimeout(r, 300));
      await saveScreenshot("03-start-business-spice-fees.png");

      // Tab 4: Sources
      await evaluateExpr(`document.querySelector('[data-testid="drawer-tab-sources"]')?.click()`);
      await new Promise((r) => setTimeout(r, 300));
      await saveScreenshot("04-start-business-spice-sources.png");

      // Extract verbatim SPICe+ source text
      const spiceSourceVerbatim = await evaluateExpr(`(() => {
        const panel = document.querySelector('[data-testid="drawer-tab-panel-sources"]');
        return panel ? panel.innerText : "Source panel not found";
      })()`);
      console.log("\n==========================================");
      console.log("SPICe+ SOURCE TEXT (VERBATIM):");
      console.log(spiceSourceVerbatim);
      console.log("==========================================");

      // Close drawer for situation rail testing
      await evaluateExpr(`document.querySelector('[data-testid="drawer-close-btn"]')?.click()`);
      await new Promise((r) => setTimeout(r, 400));

      // Toggle business.serves_food to false then true
      console.log("\nSetting business.sector to it_saas and toggling serves_food...");
      await evaluateExpr(`(() => {
        const editAllBtn = document.querySelector('[data-testid="fact-card-edit-all"]');
        if (editAllBtn) editAllBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 300));

      await evaluateExpr(`(() => {
        const noBtn = document.querySelector('[data-testid="fact-bool-no-business.serves_food"]');
        if (noBtn) noBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 500));

      const toastFalse = await evaluateExpr(`document.querySelector('[data-testid="recompose-toast"]')?.innerText`);
      console.log("\nRECOMPOSE TOAST (serves_food=false):", toastFalse);

      await evaluateExpr(`(() => {
        const yesBtn = document.querySelector('[data-testid="fact-bool-yes-business.serves_food"]');
        if (yesBtn) yesBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 500));

      const toastTrue = await evaluateExpr(`document.querySelector('[data-testid="recompose-toast"]')?.innerText`);
      console.log("RECOMPOSE TOAST (serves_food=true):", toastTrue);
      await saveScreenshot("05-start-business-serves-food-toast.png");

      // Answer top question in QuestionsPanel
      await evaluateExpr(`(() => {
        const topYes = document.querySelector('[data-testid^="question-answer-yes-"]');
        if (topYes) topYes.click();
      })()`);
      await new Promise((r) => setTimeout(r, 500));
      await saveScreenshot("06-start-business-answered-question.png");

      // 2D View of start-business-mumbai
      console.log("\nTesting 2D view on start-business-mumbai...");
      await evaluateExpr(`document.querySelector('[data-testid="footer-view-mode-toggle"]')?.click()`);
      await new Promise((r) => setTimeout(r, 1200));

      // Measure 2D zoom and on-screen font size
      const metrics2D = await evaluateExpr(`(() => {
        const transformEl = document.querySelector('.react-flow__viewport');
        const transform = transformEl ? transformEl.style.transform : '';
        const nodeTitle = document.querySelector('[data-testid^="2d-station-node-"] .font-semibold');
        const computed = nodeTitle ? window.getComputedStyle(nodeTitle) : null;
        const fontSize = computed ? computed.fontSize : 'unknown';
        // Extract scale from transform matrix or scale(x)
        const match = transform.match(/scale\\(([^)]+)\\)/);
        const zoom = match ? parseFloat(match[1]) : 1.0;
        return { transform, zoom, fontSize, titleText: nodeTitle?.innerText };
      })()`);
      console.log("\n==========================================");
      console.log("2D VIEW METRICS (start-business-mumbai focused stage):", metrics2D);
      console.log("==========================================");

      await saveScreenshot("09-start-business-2d-focus.png");

      // Toggle Whole Route in 2D
      await evaluateExpr(`document.querySelector('[data-testid="footer-whole-route-toggle"]')?.click()`);
      await new Promise((r) => setTimeout(r, 800));
      await saveScreenshot("10-start-business-2d-whole.png");

      // Switch back to 3D and whole route off
      await evaluateExpr(`document.querySelector('[data-testid="footer-whole-route-toggle"]')?.click()`);
      await evaluateExpr(`document.querySelector('[data-testid="footer-view-mode-toggle"]')?.click()`);
      await new Promise((r) => setTimeout(r, 500));

      // 2. new-water-connection-mumbai
      console.log("\n--- Testing new-water-connection-mumbai ---");
      await navigate(`${BASE_URL}/journey/new-water-connection-mumbai`);
      await new Promise((r) => setTimeout(r, 1500));
      await saveScreenshot("07-water-connection-first-view.png");

      // Open first step and show Source tab
      await evaluateExpr(`(() => {
        const firstBtn = document.querySelector('[data-station-id] button') || document.querySelector('[data-station-id]');
        if (firstBtn) firstBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 500));
      await evaluateExpr(`document.querySelector('[data-testid="drawer-tab-sources"]')?.click()`);
      await new Promise((r) => setTimeout(r, 300));
      await saveScreenshot("08-water-connection-source-tab.png");

      // 3. Responsive tests
      console.log("\n--- Testing width 1100px (situation sheet) ---");
      await setViewport(1100, 900);
      await evaluateExpr(`document.querySelector('[data-testid="open-situation-sheet-btn"]')?.click()`);
      await new Promise((r) => setTimeout(r, 500));
      await saveScreenshot("15-width-1100-situation-sheet.png");

      console.log("\n--- Testing width 900px (2D default) ---");
      await setViewport(900, 800);
      await navigate(`${BASE_URL}/journey/start-business-mumbai`);
      await new Promise((r) => setTimeout(r, 1500));
      await saveScreenshot("16-width-900-2d-default.png");

      // 4. Check page scroll at 1440x900 & 1280x800
      await setViewport(1440, 900);
      await navigate(`${BASE_URL}/journey/start-business-mumbai`);
      await new Promise((r) => setTimeout(r, 1000));
      const scroll1440 = await evaluateExpr(`({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        docScrollWidth: document.documentElement.scrollWidth,
        docScrollHeight: document.documentElement.scrollHeight,
        winInnerWidth: window.innerWidth,
        winInnerHeight: window.innerHeight,
      })`);
      console.log("Scroll at 1440x900:", scroll1440);

      await setViewport(1280, 800);
      await new Promise((r) => setTimeout(r, 500));
      const scroll1280 = await evaluateExpr(`({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        docScrollWidth: document.documentElement.scrollWidth,
        docScrollHeight: document.documentElement.scrollHeight,
        winInnerWidth: window.innerWidth,
        winInnerHeight: window.innerHeight,
      })`);
      console.log("Scroll at 1280x800:", scroll1280);

    } else if (dataSourceMode === "fixtures") {
      console.log("\n--- Part B: Testing Fixtures (DATA_SOURCE=fixtures) ---");

      // 1. example-startup in 2D
      await setViewport(1440, 900);
      await navigate(`${BASE_URL}/journey/example-startup`);
      await new Promise((r) => setTimeout(r, 1500));

      // Switch to 2D view
      await evaluateExpr(`document.querySelector('[data-testid="footer-view-mode-toggle"]')?.click()`);
      await new Promise((r) => setTimeout(r, 1000));
      await saveScreenshot("11-example-startup-2d.png");

      // Mark done via Space / click in 2D
      await evaluateExpr(`(() => {
        const firstNode = document.querySelector('[data-testid^="2d-station-node-"]');
        if (firstNode) {
          firstNode.click();
        }
      })()`);
      await new Promise((r) => setTimeout(r, 400));
      await evaluateExpr(`document.querySelector('[data-testid="drawer-mark-done-btn"]')?.click()`);
      await new Promise((r) => setTimeout(r, 400));
      await saveScreenshot("12-example-startup-markdone-2d.png");

      // Switch back to 3D to show synced state
      await evaluateExpr(`document.querySelector('[data-testid="footer-view-mode-toggle"]')?.click()`);
      await new Promise((r) => setTimeout(r, 1000));
      await saveScreenshot("13-example-startup-synced-3d.png");

      // 2. stress-25-synthetic in 2D
      await navigate(`${BASE_URL}/journey/stress-25-synthetic`);
      await new Promise((r) => setTimeout(r, 1500));
      await evaluateExpr(`document.querySelector('[data-testid="footer-view-mode-toggle"]')?.click()`);
      await new Promise((r) => setTimeout(r, 1000));
      await saveScreenshot("14-stress-synthetic-2d.png");
    }

    console.log("\n=== Captured Screenshots Summary ===");
    for (const f of capturedFiles) {
      console.log(`- ${f.filename} (${f.sizeBytes.toLocaleString()} bytes) -> ${f.path}`);
    }

    ws.close();
    chrome.kill();
  } catch (err) {
    console.error("Capture failed:", err);
    chrome.kill();
    process.exit(1);
  }
}

runCapture();
