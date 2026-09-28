import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import JourneyPrintPage, { generateMetadata } from "./page";

// Mock server journeys
vi.mock("@/lib/server/journeys", () => ({
  getJourneyRepository: () => ({
    getPublishedJourney: async (taskId: string) => {
      if (taskId === "test-task") {
        return {
          template: {
            taskId: "test-task",
            revision: 1,
            title: "Test Business Registration",
            summary: "Procedure summary for registering a business",
            jurisdiction: { country: "IN", state: "Maharashtra", city: "Mumbai" },
            category: "business_and_trade",
            keywords: [],
            sources: [],
            questions: [],
            modules: [
              {
                moduleId: "test-mod",
                version: 1,
                requirement: "mandatory",
                activation: null,
                reason: "Mandatory step",
              },
            ],
            links: [],
            meta: { origin: "curated", updatedAt: "2026-09-01" },
          },
          modules: [
            {
              moduleId: "test-mod",
              version: 1,
              title: "Test Module",
              department: "Municipal Dept",
              authoritySlug: "mcgm",
              category: "business_and_trade",
              jurisdiction: { country: "IN", state: "Maharashtra", city: "Mumbai" },
              steps: [
                {
                  id: "step-1",
                  title: "Submit online application",
                  description: "Apply through the official portal",
                  kind: "government",
                  department: "Trade Licencing",
                  authoritySlug: "mcgm",
                  officeType: "online_portal",
                  mode: "online",
                  requirement: { kind: "mandatory" },
                  fee: { kind: "fixed", amountINR: 500, currency: "INR", sourceRef: "src-1" },
                  timeline: {
                    officialSla: {
                      kind: "sla",
                      duration: { minDays: 7, maxDays: 7, dayType: "working" },
                      sourceRef: "src-1",
                    },
                    conditional: [],
                  },
                  applicationPortal: {
                    name: "Aaple Sarkar",
                    url: "https://aaplesarkar.mahaonline.gov.in/",
                  },
                  forms: [
                    {
                      name: "Form A - Application",
                      code: "FORM-A",
                      url: "https://portal.mcgm.gov.in/form-a.pdf",
                    },
                  ],
                  documents: [
                    {
                      documentTypeId: "pan-card",
                      name: "PAN Card of Applicant",
                      acceptedFormats: ["PDF", "JPG"],
                      maxSizeKB: 2048,
                    },
                  ],
                  outputs: [],
                  sourceIds: ["src-1"],
                  review: { status: "verified", verifiedOn: "2026-09-01" },
                },
              ],
              edges: [],
              sources: [
                {
                  id: "src-1",
                  title: "Trade Licensing Guidelines",
                  url: "https://portal.mcgm.gov.in/guidelines",
                  domain: "portal.mcgm.gov.in",
                  kind: "guideline",
                  retrievedOn: "2026-09-01",
                },
              ],
              entrySteps: ["step-1"],
              exitSteps: ["step-1"],
              meta: { origin: "curated", updatedAt: "2026-09-01" },
            },
          ],
        };
      }
      return null;
    },
    listTemplates: async () => [],
  }),
}));

describe("JourneyPrintPage (E3)", () => {
  it("generates correct metadata", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ taskId: "test-task" }) });
    expect(meta.title).toBe("Test Business Registration — Checklist | CivicWeave");
    expect(meta.description).toContain("Official procedure checklist");
  });

  it("renders checklist with steps, official URLs printed in full, documents and forms", async () => {
    const pageComponent = await JourneyPrintPage({
      params: Promise.resolve({ taskId: "test-task" }),
    });

    const html = renderToStaticMarkup(pageComponent);

    // Header info
    expect(html).toContain("Test Business Registration");
    expect(html).toContain("Mumbai, Maharashtra");
    expect(html).toContain("1 steps");

    // Step info
    expect(html).toContain("Submit online application");
    expect(html).toContain("Trade Licencing");
    expect(html).toContain("Online");

    // Fee & SLA
    expect(html).toContain("₹500");
    expect(html).toContain("working days");

    // Documents
    expect(html).toContain("PAN Card of Applicant");
    expect(html).toContain("Format: PDF, JPG");

    // Forms with URL printed in full
    expect(html).toContain("Form A - Application");
    expect(html).toContain("https://portal.mcgm.gov.in/form-a.pdf");

    // Application portal URL printed in full
    expect(html).toContain("Aaple Sarkar");
    expect(html).toContain("https://aaplesarkar.mahaonline.gov.in/");

    // Official Source URL printed in full
    expect(html).toContain("https://portal.mcgm.gov.in/guidelines");

    // Print button
    expect(html).toContain('data-testid="print-page-btn"');
  });
});
