import { expect, test } from "@playwright/test";

/**
 * The citizen path (PL-7 item 2, demo script §15.6).
 *
 * What runs today is the journey page itself. The search-driven half and the mark-done assertions wait
 * on frontend work that does not exist yet — those are marked fixme with the milestone they need, so the
 * gap is visible in the report rather than silently missing.
 */
test.describe("the demo journey renders from seed data", () => {
  test("loads and shows the procedure's title", async ({ page }) => {
    const response = await page.goto("/journey/start-business-mumbai");
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toContainText(/business/i, { timeout: 15_000 });
  });

  test("an unpublished journey is a 404, not a blank page", async ({ page }) => {
    const response = await page.goto("/journey/no-such-journey");
    expect(response?.status()).toBe(404);
  });

  test("the page reports no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      // The only known harmless warning (AGENTS.md).
      if (message.type() === "error" && !message.text().includes("THREE.Clock")) errors.push(message.text());
    });
    await page.goto("/journey/start-business-mumbai", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    expect(errors).toEqual([]);
  });
});

// Needs FE-5: the landing search box, POST /api/v1/search wired up, and the fact card.
test.fixme("search: the demo sentence reaches the journey with its facts", async () => {});

// Needs FE-4: mark done in the step drawer, and the 2D view's accessible labels
// ("Step 2 of 9, File the incorporation form, available, 2 prerequisites done").
test.fixme("marking SPICe+ done unlocks the downstream stations", async () => {});
