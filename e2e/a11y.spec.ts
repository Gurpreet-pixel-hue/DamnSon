import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility (PL-7 item 4, PRD §11.3, target WCAG 2.2 AA).
 *
 * The point of this spec is to produce a punch-list, so every violation is printed with the nodes that
 * caused it. It fails only on serious and critical issues; FE-8's target is zero of any severity.
 */
type Violation = { id: string; impact?: string | null | undefined; help: string; nodes: { target: unknown[] }[] };

async function scan(page: Page, url: string): Promise<Violation[]> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // The journey page renders its map after data loads; give it a moment before scanning.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations as Violation[];
}

function report(url: string, violations: Violation[]): void {
  if (violations.length === 0) {
    console.log(`axe: ${url} — no violations`);
    return;
  }
  console.log(`\naxe: ${url} — ${violations.length} violation(s)`);
  for (const v of violations) {
    console.log(`  [${v.impact ?? "unknown"}] ${v.id}: ${v.help}`);
    for (const node of v.nodes.slice(0, 3)) console.log(`      ${JSON.stringify(node.target)}`);
    if (v.nodes.length > 3) console.log(`      …and ${v.nodes.length - 3} more`);
  }
}

for (const [name, url] of [
  ["the landing page", "/"],
  ["the demo journey", "/journey/start-business-mumbai"],
] as const) {
  test(`${name} has no serious or critical accessibility violations`, async ({ page }) => {
    const violations = await scan(page, url);
    report(url, violations);
    const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
