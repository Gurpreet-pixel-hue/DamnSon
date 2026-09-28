import { expect, test } from "@playwright/test";

/**
 * The admin path (PL-7 item 3): flag a step, save the draft, publish, and see the flag on the citizen
 * journey. The API behind this is verified by scripts/admin-curl.sh against civicweave-dev; what is
 * missing is FE-7's admin UI, so the browser half cannot be written yet.
 */
test("the admin area refuses an anonymous visitor", async ({ page }) => {
  await page.goto("/admin");
  // Whatever FE-7 eventually renders, an anonymous visitor must never see module content.
  await expect(page.locator("body")).not.toContainText("start-business-mumbai");
});

// Needs FE-7 (admin sign-in, modules table, step review sheet) and a test admin on the target
// deployment. The same flow is already proven at the API level by scripts/admin-curl.sh.
test.fixme("an admin flags a step, publishes, and the citizen journey shows it", async () => {});
