import { spawn } from "node:child_process";

const CHROME_PATH =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  console.log("=== Testing 0px Hover Displacement (§10.6) ===");

  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9228",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=metal",
    "--window-size=1440,900",
    "about:blank",
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  const listRes = await fetch("http://localhost:9228/json/list");
  const pages = await listRes.json();
  const page = pages.find((p) => p.type === "page") || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 1;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      callbacks.get(data.id)(data);
      callbacks.delete(data.id);
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
  await send("Input.enable");

  await send("Page.navigate", { url: "http://localhost:3000/journey/demo-metro-synthetic" });

  // Wait until camera is completely still (transform does not change for 500ms)
  console.log("Waiting for camera controls to settle completely...");
  await send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `new Promise((resolve) => {
      let lastTransform = "";
      let stillCount = 0;
      const interval = setInterval(() => {
        const card = document.querySelector('[data-testid="label-layer"] button[data-mode]');
        const transform = card ? card.style.transform : "";
        if (transform && transform === lastTransform) {
          stillCount++;
          if (stillCount >= 6) {
            clearInterval(interval);
            resolve();
          }
        } else {
          lastTransform = transform;
          stillCount = 0;
        }
      }, 100);
    })`,
  });
  console.log("Camera is completely still.");

  // 1. Get initial visible label and pin rects while camera is still
  const initialRectsRes = await send("Runtime.evaluate", {
    expression: `(() => {
      const els = Array.from(document.querySelectorAll('[data-testid="label-layer"] button'));
      const visible = els.filter(el => window.getComputedStyle(el).visibility !== 'hidden');
      return visible.map(el => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('aria-label') || el.innerText,
          x: Math.round(r.left),
          y: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
          transform: el.style.transform
        };
      });
    })()`,
    returnByValue: true,
  });

  const initialRects = initialRectsRes?.result?.result?.value || [];
  console.log(`Initial visible labels/pins count: ${initialRects.length}`);

  // Find 3 distinct label card centers to sweep across
  const targetCardsRes = await send("Runtime.evaluate", {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="label-layer"] button[data-mode]'))
        .filter(el => window.getComputedStyle(el).visibility !== 'hidden');
      return cards.slice(0, 3).map(el => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('aria-label') || el.innerText,
          cx: Math.round(r.left + r.width / 2),
          cy: Math.round(r.top + r.height / 2)
        };
      });
    })()`,
    returnByValue: true,
  });

  const targetCards = targetCardsRes?.result?.result?.value || [];
  console.log(`Target cards to sweep across:`, targetCards);

  let maxDisplacement = 0;
  let displacementsChecked = 0;

  for (const target of targetCards) {
    console.log(`Moving pointer to ${target.id} at (${target.cx}, ${target.cy})...`);
    // Dispatch mouse move to target
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: target.cx,
      y: target.cy,
    });
    // Wait 350ms (covers 60ms enter hysteresis)
    await new Promise((r) => setTimeout(r, 350));

    // Measure positions of all OTHER labels
    const currentRectsRes = await send("Runtime.evaluate", {
      expression: `(() => {
        const els = Array.from(document.querySelectorAll('[data-testid="label-layer"] button'));
        const visible = els.filter(el => window.getComputedStyle(el).visibility !== 'hidden');
        return visible.map(el => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute('aria-label') || el.innerText,
            x: Math.round(r.left),
            y: Math.round(r.top),
            transform: el.style.transform
          };
        });
      })()`,
      returnByValue: true,
    });

    const currentRects = currentRectsRes?.result?.result?.value || [];
    const currentMap = new Map(currentRects.map(c => [c.id, c]));

    for (const init of initialRects) {
      if (init.id === target.id) continue; // skip the hovered one
      const curr = currentMap.get(init.id);
      if (curr) {
        const dx = Math.abs(curr.x - init.x);
        const dy = Math.abs(curr.y - init.y);
        const dist = Math.max(dx, dy);
        if (dist > maxDisplacement) {
          maxDisplacement = dist;
          console.log(`Displacement detected on ${init.id}: dx=${dx}, dy=${dy} (was ${init.transform}, now ${curr.transform})`);
        }
        displacementsChecked++;
      }
    }
  }

  console.log(`\n=== 0 px Displacement Capture Results ===`);
  console.log(`Non-hovered label displacements checked: ${displacementsChecked}`);
  console.log(`Maximum displacement measured: ${maxDisplacement} px`);

  chrome.kill();

  if (maxDisplacement > 0) {
    console.error(`FAILED: Expected 0 px displacement, got ${maxDisplacement} px!`);
    process.exit(1);
  } else {
    console.log(`PASSED: 0 px displacement verified across all non-hovered labels.`);
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
