import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REVIEW_DIR = path.resolve(process.cwd(), ".next/claude-review/fe-4");
if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

const CHROME_PATH =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function main() {
  console.log("=== Starting FE-4 Review Capture ===");
  console.log(`Review Directory: ${REVIEW_DIR}`);

  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9238",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=metal",
    "--window-size=1440,900",
    "about:blank",
  ]);

  await new Promise((r) => setTimeout(r, 2500));

  try {
    const listRes = await fetch("http://localhost:9238/json/list");
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

    // 1. start-business-mumbai
    console.log("\n--- 1. Testing start-business-mumbai (SPICe+ 4 tabs) ---");
    await setViewport(1440, 900);
    await navigate(`${BASE_URL}/journey/start-business-mumbai`);

    // Switch to Stage 2 and select mca-spice-plus.file
    await evaluateExpr(`(() => {
      // Find Stage 2 button
      const stageButtons = Array.from(document.querySelectorAll('[data-testid^="stepper-stage-"]'));
      if (stageButtons[1]) stageButtons[1].click();
    })()`);
    await new Promise((r) => setTimeout(r, 600));

    // Open SPICe+ station card
    await evaluateExpr(`(() => {
      const card = document.querySelector('[data-station-id="mca-spice-plus.file"] button');
      if (card) {
        card.click();
      } else {
        const firstCard = document.querySelector('[data-station-id] button');
        if (firstCard) firstCard.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 600));

    // Tab 1: Overview
    await evaluateExpr(`(() => {
      const btn = document.querySelector('[data-testid="drawer-tab-overview"]');
      if (btn) btn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 300));
    await saveScreenshot("01-start-business-spice-overview.png");

    // Tab 2: Documents
    await evaluateExpr(`(() => {
      const btn = document.querySelector('[data-testid="drawer-tab-documents"]');
      if (btn) btn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 300));
    await saveScreenshot("02-start-business-spice-documents.png");

    // Tab 3: Fees & SLA
    await evaluateExpr(`(() => {
      const btn = document.querySelector('[data-testid="drawer-tab-fees"]');
      if (btn) btn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 300));
    await saveScreenshot("03-start-business-spice-fees.png");

    // Tab 4: Sources
    await evaluateExpr(`(() => {
      const btn = document.querySelector('[data-testid="drawer-tab-sources"]');
      if (btn) btn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 300));
    await saveScreenshot("04-start-business-spice-sources.png");

    // Extract verbatim SPICe+ source text
    const spiceSourceVerbatim = await evaluateExpr(`(() => {
      const panel = document.querySelector('[data-testid="drawer-tab-panel-sources"]');
      if (!panel) return "Source panel not found";
      return panel.innerText;
    })()`);
    console.log("\n==========================================");
    console.log("SPICe+ SOURCE TEXT (VERBATIM):");
    console.log(spiceSourceVerbatim);
    console.log("==========================================\n");

    // Close drawer
    await evaluateExpr(`(() => {
      const closeBtn = document.querySelector('[data-testid="drawer-close-button"]');
      if (closeBtn) closeBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    // Toggle business.serves_food to trigger recompose toast
    console.log("Setting business.sector to it_saas...");
    await evaluateExpr(`(() => {
      const editBtn = document.querySelector('[data-testid="fact-toggle-edit-business.sector"]');
      if (editBtn) editBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    await evaluateExpr(`(() => {
      const select = document.querySelector('[data-testid="fact-enum-select-business.sector"]');
      if (select) {
        select.value = 'it_saas';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    console.log("Setting business.serves_food to false (removes FSSAI)...");
    await evaluateExpr(`(() => {
      const editBtn = document.querySelector('[data-testid="fact-toggle-edit-business.serves_food"]');
      if (editBtn) editBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    await evaluateExpr(`(() => {
      const noBtn = document.querySelector('[data-testid="fact-bool-no-business.serves_food"]');
      if (noBtn) noBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    const toastRemoved = await evaluateExpr(`(() => {
      const el = document.querySelector('[data-testid="recompose-toast"]');
      return el ? el.innerText : "No toast found";
    })()`);
    console.log("\n==========================================");
    console.log("RECOMPOSE TOAST (serves_food=false):");
    console.log(toastRemoved);
    console.log("==========================================\n");

    console.log("Toggling business.serves_food to true (adds FSSAI)...");
    await evaluateExpr(`(() => {
      const yesBtn = document.querySelector('[data-testid="fact-bool-yes-business.serves_food"]');
      if (yesBtn) yesBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    const toastAdded = await evaluateExpr(`(() => {
      const el = document.querySelector('[data-testid="recompose-toast"]');
      return el ? el.innerText : "No toast found";
    })()`);
    console.log("\n==========================================");
    console.log("RECOMPOSE TOAST (serves_food=true):");
    console.log(toastAdded);
    console.log("==========================================\n");

    await saveScreenshot("05-start-business-serves-food-toast.png");

    // Answer top decisive question in QuestionsPanel
    console.log("Answering top question in QuestionsPanel...");
    await evaluateExpr(`(() => {
      const optBtn = document.querySelector('[data-testid^="question-opt-"]') || document.querySelector('[data-testid^="question-answer-"]');
      if (optBtn) optBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 600));
    await saveScreenshot("06-start-business-answered-question.png");

    // 2. new-water-connection-mumbai
    console.log("\n--- 2. Testing new-water-connection-mumbai ---");
    await navigate(`${BASE_URL}/journey/new-water-connection-mumbai`);
    await new Promise((r) => setTimeout(r, 1000));
    await saveScreenshot("07-water-connection-first-view.png");

    // Open first station and show Source tab
    await evaluateExpr(`(() => {
      const firstBtn = document.querySelector('[data-station-id] button');
      if (firstBtn) firstBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    await evaluateExpr(`(() => {
      const srcTab = document.querySelector('[data-testid="drawer-tab-sources"]');
      if (srcTab) srcTab.click();
    })()`);
    await new Promise((r) => setTimeout(r, 400));
    await saveScreenshot("08-water-connection-source-tab.png");

    // 3. example-startup in 2D
    console.log("\n--- 3. Testing example-startup in 2D ---");
    await navigate(`${BASE_URL}/journey/example-startup`);
    await new Promise((r) => setTimeout(r, 1000));

    // Switch to 2D
    await evaluateExpr(`(() => {
      const toggle2d = document.querySelector('[data-testid="footer-toggle-2d"]');
      if (toggle2d) toggle2d.click();
    })()`);
    await new Promise((r) => setTimeout(r, 600));
    await saveScreenshot("09-example-startup-2d.png");

    // Keyboard walk in 2D: ArrowRight, Enter, Space (toggle done)
    console.log("Keyboard walk in 2D...");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" });
    await new Promise((r) => setTimeout(r, 300));
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
    await new Promise((r) => setTimeout(r, 500));
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space" });
    await new Promise((r) => setTimeout(r, 600));
    await saveScreenshot("10-example-startup-markdone-2d.png");

    // Switch back to 3D
    await evaluateExpr(`(() => {
      const toggle3d = document.querySelector('[data-testid="footer-toggle-3d"]');
      if (toggle3d) toggle3d.click();
    })()`);
    await new Promise((r) => setTimeout(r, 600));
    await saveScreenshot("11-example-startup-synced-3d.png");

    // 4. stress-25-synthetic in 2D
    console.log("\n--- 4. Testing stress-25-synthetic in 2D ---");
    await navigate(`${BASE_URL}/journey/stress-25-synthetic`);
    await new Promise((r) => setTimeout(r, 1000));
    await evaluateExpr(`(() => {
      const toggle2d = document.querySelector('[data-testid="footer-toggle-2d"]');
      if (toggle2d) toggle2d.click();
    })()`);
    await new Promise((r) => setTimeout(r, 600));
    await saveScreenshot("12-stress-synthetic-2d.png");

    // 5. Width checks
    console.log("\n--- 5. Testing width 1100px (situation sheet) ---");
    await setViewport(1100, 800);
    await navigate(`${BASE_URL}/journey/start-business-mumbai`);
    await new Promise((r) => setTimeout(r, 1000));
    await evaluateExpr(`(() => {
      const sheetBtn = document.querySelector('[data-testid="rail-btn-situation-sheet"]');
      if (sheetBtn) sheetBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    await saveScreenshot("13-width-1100-situation-sheet.png");

    console.log("\n--- Testing width 900px (2D default) ---");
    await setViewport(900, 700);
    await navigate(`${BASE_URL}/journey/start-business-mumbai`);
    await new Promise((r) => setTimeout(r, 1200));
    await saveScreenshot("14-width-900-2d-default.png");

    // Scroll checks
    console.log("\n--- 6. Checking page scroll at 1440x900 & 1280x800 ---");
    await setViewport(1440, 900);
    await navigate(`${BASE_URL}/journey/start-business-mumbai`);
    const scroll1440 = await evaluateExpr(`(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      docScrollWidth: document.documentElement.scrollWidth,
      docScrollHeight: document.documentElement.scrollHeight,
      winInnerWidth: window.innerWidth,
      winInnerHeight: window.innerHeight,
    }))()`);
    console.log("Scroll at 1440x900:", scroll1440);

    await setViewport(1280, 800);
    await navigate(`${BASE_URL}/journey/start-business-mumbai`);
    const scroll1280 = await evaluateExpr(`(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      docScrollWidth: document.documentElement.scrollWidth,
      docScrollHeight: document.documentElement.scrollHeight,
      winInnerWidth: window.innerWidth,
      winInnerHeight: window.innerHeight,
    }))()`);
    console.log("Scroll at 1280x800:", scroll1280);

    console.log("\n=== Captured Screenshots Summary ===");
    for (const file of capturedFiles) {
      console.log(`- ${file.filename} (${file.sizeBytes} bytes) -> ${file.path}`);
    }

    await ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error("Error in capture script:", err);
  process.exit(1);
});
