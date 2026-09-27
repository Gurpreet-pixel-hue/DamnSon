import { describe, it, expect } from "vitest";
import {
  selectLabels,
  resolveLabelCollisions,
  rectsOverlap,
  SAFE_INSETS,
  type ProjectedStationPoint,
  type ScreenRect,
} from "./selectLabels";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";

function makeDummyStation(
  id: string,
  state: StationVM["state"] = "available",
  applicability: StationVM["applicability"] = "applies"
): StationVM {
  return {
    id,
    title: `Station ${id}`,
    kind: "government",
    officeType: "municipal_hq",
    mode: "in_person",
    state,
    applicability,
    layer: 0,
    lane: 0,
    position3D: [0, 0, 0],
    position2D: { x: 0, y: 0 },
  };
}

function makeDummyMetro(stations: StationVM[]): MetroVM {
  return {
    stations,
    tracks: [],
  };
}

describe("selectLabels", () => {
  it("prioritizes selected first, then next-up available mandatory stations, without hover/focus inputs (§10.6)", () => {
    const stations = [
      makeDummyStation("s1", "locked"),
      makeDummyStation("s2", "available"),
      makeDummyStation("s3", "available"),
      makeDummyStation("s4", "available"),
      makeDummyStation("s5", "locked"),
    ];
    const metro = makeDummyMetro(stations);

    // s4 is selected; s5/s1 (passed as legacy or hover/focus) are ignored
    const labels = selectLabels(metro, "s4");
    // s4 (selected), then s2, s3 (available next-up), then s1, s5 (locked)
    expect(labels.map((s) => s.id)).toEqual(["s4", "s2", "s3", "s1", "s5"]);
  });

  it("the same inputs with a different hoveredStepId give identical slots, because hover is not an input (§10.6)", () => {
    const stations = [
      makeDummyStation("s1", "available"),
      makeDummyStation("s2", "available"),
      makeDummyStation("s3", "locked"),
      makeDummyStation("s4", "locked"),
    ];
    const metro = makeDummyMetro(stations);

    const labelsNoHover = selectLabels(metro, null);
    const labelsWithHover1 = selectLabels(metro, "s3", "s3", null); // legacy call simulation
    const labelsWithHover2 = selectLabels(metro, "s4", "s4", null);

    expect(labelsNoHover.map((s) => s.id)).toEqual(labelsWithHover1.map((s) => s.id));
    expect(labelsNoHover.map((s) => s.id)).toEqual(labelsWithHover2.map((s) => s.id));
  });

  it("shows all stations when count <= 16", () => {
    const stations = Array.from({ length: 12 }, (_, i) =>
      makeDummyStation(`s${i + 1}`, i < 2 ? "done" : i < 6 ? "available" : "locked")
    );
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, null);
    expect(labels).toHaveLength(12);
  });

  it("prioritizes selected, next-up and last done when count > 16", () => {
    const stations = Array.from({ length: 20 }, (_, i) =>
      makeDummyStation(`s${i + 1}`, i === 0 ? "done" : i < 4 ? "available" : "locked")
    );
    const metro = makeDummyMetro(stations);

    // Select s15
    const labels = selectLabels(metro, "s15");
    const ids = labels.map((s) => s.id);
    expect(ids[0]).toBe("s15"); // selected
    expect(ids).toContain("s2"); // next-up available
    expect(ids).toContain("s3"); // next-up available
    expect(ids).toContain("s4"); // next-up available
    expect(ids).toContain("s1"); // last done
  });

  it("skips optional stations from next-up priority when count > 16", () => {
    const stations = Array.from({ length: 18 }, (_, i) =>
      makeDummyStation(
        `s${i + 1}`,
        i < 3 ? "available" : "locked",
        i === 0 ? "optional" : "applies"
      )
    );
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, null);
    const ids = labels.map((s) => s.id);
    // s1 is optional available, s2 and s3 are non-optional available
    expect(ids).toContain("s2");
    expect(ids).toContain("s3");
    expect(ids.indexOf("s2")).toBeLessThan(ids.indexOf("s1") === -1 ? 999 : ids.indexOf("s1"));
  });

  it("hovering across stations produces 0 px displacement on all other labels (§10.6)", () => {
    const stations = DEMO_1440.pts.map((p) =>
      makeDummyStation(p.id, "available", "applies")
    );
    const projectedMap = new Map<string, ProjectedStationPoint>();
    for (const p of DEMO_1440.pts) {
      projectedMap.set(p.id, p);
    }

    const basePlacements = resolveLabelCollisions({
      stations,
      projectedPoints: projectedMap,
      stageHeaders: DEMO_1440.headerBoxes,
      viewport: { width: 1440, height: 900 },
      hoveredStepId: null,
    });

    // Simulate hovering across 3 different stations
    const testStations = [stations[0]!.id, stations[3]!.id, stations[5]!.id];
    for (const hoveredId of testStations) {
      const hoverPlacements = resolveLabelCollisions({
        stations,
        projectedPoints: projectedMap,
        stageHeaders: DEMO_1440.headerBoxes,
        viewport: { width: 1440, height: 900 },
        hoveredStepId: hoveredId,
        previousPlacements: basePlacements,
      });

      for (const [id, basePl] of basePlacements.entries()) {
        if (id === hoveredId) continue; // non-hovered labels must have 0px displacement
        const hoverPl = hoverPlacements.get(id);
        expect(hoverPl).toBeDefined();
        if (basePl.mode === hoverPl!.mode && basePl.mode !== "none") {
          const dx = Math.abs(basePl.xOff - hoverPl!.xOff);
          const dy = Math.abs(basePl.yOff - hoverPl!.yOff);
          expect(dx).toBe(0);
          expect(dy).toBe(0);
          expect(basePl.rect).toEqual(hoverPl!.rect);
        }
      }
    }
  });

  it("ignores non-existent station IDs gracefully", () => {
    const stations = [makeDummyStation("s1", "available")];
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, "ghost-selected");
    expect(labels.map((s) => s.id)).toEqual(["s1"]);
  });
});

const DEMO_1440 = {
  pts: [
    { id: "demo-identity.verify-id", title: "[Synthetic] Verify digital identity", lane: 0, layer: 0, x: 61, y: 616, pinX: 69, pinY: 643 },
    { id: "demo-identity.director-kyc.1", title: "[Synthetic] Director KYC intimation (Founder 1)", lane: 0, layer: 1, x: 209, y: 590, pinX: 216, pinY: 617 },
    { id: "demo-incorporation.charter-draft", title: "[Synthetic] Notarize entity charter", lane: 0, layer: 2, x: 358, y: 598, pinX: 363, pinY: 624 },
    { id: "demo-incorporation.register-entity", title: "[Synthetic] File municipal entity registration", lane: 0, layer: 3, x: 492, y: 542, pinX: 495, pinY: 568 },
    { id: "demo-incorporation.entity-formed", title: "[Synthetic] Entity formed", lane: 0, layer: 4, x: 628, y: 551, pinX: 629, pinY: 577 },
    { id: "demo-premises.noc-fire", title: "[Synthetic] Fire safety NOC", lane: 0, layer: 5, x: 757, y: 528, pinX: 757, pinY: 554 },
    { id: "demo-premises.utility-meter", title: "[Synthetic] Commercial electric connection", lane: 0, layer: 6, x: 883, y: 507, pinX: 881, pinY: 532 },
    { id: "demo-food.health-permit", title: "[Synthetic] Health and food licence", lane: -1, layer: 7, x: 974, y: 437, pinX: 971, pinY: 462 },
    { id: "demo-trade.labour-register", title: "[Synthetic] Labour department intimation", lane: 0, layer: 7, x: 1008, y: 454, pinX: 1005, pinY: 480 },
    { id: "demo-trade.signage-permit", title: "[Synthetic] Ward commercial signage permit", lane: 0, layer: 8, x: 1122, y: 465, pinX: 1118, pinY: 490 },
    { id: "demo-trade.tax-intimation", title: "[Synthetic] Professional tax enrollment", lane: 0, layer: 9, x: 1244, y: 413, pinX: 1238, pinY: 439 },
    { id: "demo-trade.recognition", title: "[Synthetic] Startup recognition application", lane: 1, layer: 7, x: 1041, y: 505, pinX: 1037, pinY: 532 },
    { id: "demo-trade.police-intimation", title: "[Synthetic] Local police station intimation", lane: 0, layer: 10, x: 1348, y: 425, pinX: 1342, pinY: 450 },
  ],
  headerBoxes: [
    { minX: 14, maxX: 154, minY: 426, maxY: 458 },
    { minX: 137, maxX: 277, minY: 408, maxY: 440 },
    { minX: 257, maxX: 397, minY: 389, maxY: 421 },
    { minX: 374, maxX: 514, minY: 371, maxY: 403 },
    { minX: 488, maxX: 628, minY: 354, maxY: 386 },
    { minX: 599, maxX: 739, minY: 337, maxY: 369 },
    { minX: 708, maxX: 848, minY: 320, maxY: 352 },
    { minX: 813, maxX: 953, minY: 304, maxY: 336 },
    { minX: 916, maxX: 1056, minY: 289, maxY: 321 },
    { minX: 1017, maxX: 1157, minY: 273, maxY: 305 },
    { minX: 1115, maxX: 1255, minY: 258, maxY: 290 },
  ],
};

const DEMO_1280 = {
  pts: [
    { id: "demo-identity.verify-id", title: "[Synthetic] Verify digital identity", lane: 0, layer: 0, x: 54, y: 547, pinX: 61, pinY: 571 },
    { id: "demo-identity.director-kyc.1", title: "[Synthetic] Director KYC intimation (Founder 1)", lane: 0, layer: 1, x: 186, y: 525, pinX: 192, pinY: 549 },
    { id: "demo-incorporation.charter-draft", title: "[Synthetic] Notarize entity charter", lane: 0, layer: 2, x: 319, y: 532, pinX: 322, pinY: 555 },
    { id: "demo-incorporation.register-entity", title: "[Synthetic] File municipal entity registration", lane: 0, layer: 3, x: 437, y: 482, pinX: 440, pinY: 505 },
    { id: "demo-incorporation.entity-formed", title: "[Synthetic] Entity formed", lane: 0, layer: 4, x: 559, y: 490, pinX: 560, pinY: 513 },
    { id: "demo-premises.noc-fire", title: "[Synthetic] Fire safety NOC", lane: 0, layer: 5, x: 673, y: 470, pinX: 673, pinY: 492 },
    { id: "demo-premises.utility-meter", title: "[Synthetic] Commercial electric connection", lane: 0, layer: 6, x: 784, y: 450, pinX: 783, pinY: 473 },
    { id: "demo-food.health-permit", title: "[Synthetic] Health and food licence", lane: -1, layer: 7, x: 866, y: 388, pinX: 863, pinY: 410 },
    { id: "demo-trade.labour-register", title: "[Synthetic] Labour department intimation", lane: 0, layer: 7, x: 896, y: 403, pinX: 893, pinY: 426 },
    { id: "demo-trade.signage-permit", title: "[Synthetic] Ward commercial signage permit", lane: 0, layer: 8, x: 997, y: 413, pinX: 994, pinY: 435 },
    { id: "demo-trade.tax-intimation", title: "[Synthetic] Professional tax enrollment", lane: 0, layer: 9, x: 1106, y: 367, pinX: 1101, pinY: 390 },
    { id: "demo-trade.recognition", title: "[Synthetic] Startup recognition application", lane: 1, layer: 7, x: 925, y: 449, pinX: 922, pinY: 473 },
    { id: "demo-trade.police-intimation", title: "[Synthetic] Local police station intimation", lane: 0, layer: 10, x: 1199, y: 378, pinX: 1193, pinY: 400 },
  ],
  headerBoxes: [
    { minX: 4, maxX: 144, minY: 377, maxY: 409 },
    { minX: 114, maxX: 254, minY: 360, maxY: 392 },
    { minX: 221, maxX: 361, minY: 344, maxY: 376 },
    { minX: 325, maxX: 465, minY: 328, maxY: 360 },
    { minX: 426, maxX: 566, minY: 313, maxY: 345 },
    { minX: 525, maxX: 665, minY: 298, maxY: 330 },
    { minX: 621, maxX: 761, minY: 283, maxY: 315 },
    { minX: 715, maxX: 855, minY: 269, maxY: 301 },
    { minX: 807, maxX: 947, minY: 255, maxY: 287 },
    { minX: 896, maxX: 1036, minY: 241, maxY: 273 },
    { minX: 983, maxX: 1123, minY: 228, maxY: 260 },
  ],
};

const STRESS_1440 = {
  pts: [
    { id: "stress-alpha.s01", title: "[Synthetic] Portal Account Initialization", lane: -1.5, layer: 0, x: 191, y: 488, pinX: 200, pinY: 524 },
    { id: "stress-alpha.s02", title: "[Synthetic] Municipal Headquarters Intimation", lane: -0.5, layer: 0, x: 196, y: 564, pinX: 204, pinY: 600 },
    { id: "stress-alpha.s03", title: "[Synthetic] Revenue Office Assessment", lane: 0.5, layer: 0, x: 212, y: 693, pinX: 220, pinY: 729 },
    { id: "stress-alpha.s04", title: "[Synthetic] Notary Affidavit", lane: 1.5, layer: 0, x: 218, y: 788, pinX: 227, pinY: 823 },
    { id: "stress-alpha.s05", title: "[Synthetic] Ward Office Verification", lane: -2, layer: 1, x: 376, y: 468, pinX: 381, pinY: 502 },
    { id: "stress-alpha.s06", title: "[Synthetic] Labour Desk Enrolment", lane: -1, layer: 1, x: 382, y: 494, pinX: 388, pinY: 530 },
    { id: "stress-alpha.s07", title: "[Synthetic] Utility Feasibility Request", lane: 0, layer: 1, x: 403, y: 615, pinX: 409, pinY: 650 },
    { id: "stress-alpha.s08", title: "[Synthetic] Fire Safety Preliminary Review", lane: 1, layer: 1, x: 419, y: 701, pinX: 425, pinY: 736 },
    { id: "stress-alpha.s09", title: "[Synthetic] Health Officer Assessment", lane: 2, layer: 1, x: 431, y: 750, pinX: 436, pinY: 788 },
    { id: "stress-alpha.s10", title: "[Synthetic] Environmental Consent Review", lane: -1.5, layer: 2, x: 556, y: 474, pinX: 558, pinY: 508 },
    { id: "stress-alpha.s11", title: "[Synthetic] Police Jurisdiction Inquiry", lane: -0.5, layer: 2, x: 578, y: 544, pinX: 580, pinY: 579 },
    { id: "stress-alpha.s12", title: "[Synthetic] Specialized Department Clearance", lane: 0.5, layer: 2, x: 602, y: 622, pinX: 604, pinY: 657 },
    { id: "stress-alpha.s13", title: "[Synthetic] Central Portal Synthesis", lane: 1.5, layer: 2, x: 627, y: 663, pinX: 629, pinY: 700 },
    { id: "stress-beta.m14", title: "[Synthetic] Midpoint Operational Authorization", lane: 0, layer: 3, x: 768, y: 550, pinX: 767, pinY: 585 },
    { id: "stress-beta.s15", title: "[Synthetic] Head Office Confirmation", lane: -1.5, layer: 4, x: 886, y: 377, pinX: 884, pinY: 412 },
    { id: "stress-beta.s16", title: "[Synthetic] Ward Physical Record Inspection", lane: -0.5, layer: 4, x: 920, y: 485, pinX: 917, pinY: 519 },
    { id: "stress-beta.s17", title: "[Synthetic] Fire Marshal Final Compliance", lane: 0.5, layer: 4, x: 960, y: 557, pinX: 956, pinY: 591 },
    { id: "stress-beta.s18", title: "[Synthetic] Hygiene Verification", lane: 1.5, layer: 4, x: 1005, y: 636, pinX: 1000, pinY: 671 },
    { id: "stress-beta.s19", title: "[Synthetic] Stamp and Revenue Assessment", lane: -1.5, layer: 5, x: 1043, y: 352, pinX: 1039, pinY: 387 },
    { id: "stress-beta.s20", title: "[Synthetic] Workplace Standards Confirmation", lane: -0.5, layer: 5, x: 1088, y: 414, pinX: 1082, pinY: 449 },
    { id: "stress-beta.s21", title: "[Synthetic] Jurisdictional Police Endorsement", lane: 1.5, layer: 5, x: 1180, y: 602, pinX: 1173, pinY: 637 },
    { id: "stress-beta.s22", title: "[Synthetic] Effluent & Noise Certification", lane: 0.5, layer: 5, x: 1128, y: 526, pinX: 1122, pinY: 560 },
    { id: "stress-beta.s23", title: "[Synthetic] Utility Commissioning Check", lane: -1, layer: 6, x: 1211, y: 399, pinX: 1204, pinY: 433 },
    { id: "stress-beta.s24", title: "[Synthetic] Legal Attestation & Registry", lane: 0, layer: 6, x: 1262, y: 463, pinX: 1254, pinY: 497 },
    { id: "stress-beta.s25", title: "[Synthetic] Integrated Civic Registration Award", lane: 1, layer: 6, x: 1330, y: 488, pinX: 1321, pinY: 524 },
  ],
  headerBoxes: [
    { minX: 125, maxX: 265, minY: 326, maxY: 358 },
    { minX: 276, maxX: 416, minY: 304, maxY: 336 },
    { minX: 423, maxX: 563, minY: 283, maxY: 315 },
    { minX: 565, maxX: 705, minY: 262, maxY: 294 },
    { minX: 702, maxX: 842, minY: 243, maxY: 275 },
    { minX: 835, maxX: 975, minY: 224, maxY: 256 },
    { minX: 964, maxX: 1104, minY: 205, maxY: 237 },
  ],
};

const STRESS_1280 = {
  pts: [
    { id: "stress-alpha.s01", title: "[Synthetic] Portal Account Initialization", lane: -1.5, layer: 0, x: 170, y: 434, pinX: 177, pinY: 466 },
    { id: "stress-alpha.s02", title: "[Synthetic] Municipal Headquarters Intimation", lane: -0.5, layer: 0, x: 174, y: 501, pinX: 182, pinY: 534 },
    { id: "stress-alpha.s03", title: "[Synthetic] Revenue Office Assessment", lane: 0.5, layer: 0, x: 188, y: 616, pinX: 196, pinY: 648 },
    { id: "stress-alpha.s04", title: "[Synthetic] Notary Affidavit", lane: 1.5, layer: 0, x: 194, y: 700, pinX: 202, pinY: 732 },
    { id: "stress-alpha.s05", title: "[Synthetic] Ward Office Verification", lane: -2, layer: 1, x: 334, y: 416, pinX: 338, pinY: 446 },
    { id: "stress-alpha.s06", title: "[Synthetic] Labour Desk Enrolment", lane: -1, layer: 1, x: 340, y: 439, pinX: 345, pinY: 471 },
    { id: "stress-alpha.s07", title: "[Synthetic] Utility Feasibility Request", lane: 0, layer: 1, x: 359, y: 547, pinX: 363, pinY: 578 },
    { id: "stress-alpha.s08", title: "[Synthetic] Fire Safety Preliminary Review", lane: 1, layer: 1, x: 373, y: 623, pinX: 377, pinY: 654 },
    { id: "stress-alpha.s09", title: "[Synthetic] Health Officer Assessment", lane: 2, layer: 1, x: 383, y: 667, pinX: 388, pinY: 700 },
    { id: "stress-alpha.s10", title: "[Synthetic] Environmental Consent Review", lane: -1.5, layer: 2, x: 494, y: 421, pinX: 496, pinY: 451 },
    { id: "stress-alpha.s11", title: "[Synthetic] Police Jurisdiction Inquiry", lane: -0.5, layer: 2, x: 514, y: 484, pinX: 515, pinY: 515 },
    { id: "stress-alpha.s12", title: "[Synthetic] Specialized Department Clearance", lane: 0.5, layer: 2, x: 535, y: 553, pinX: 537, pinY: 584 },
    { id: "stress-alpha.s13", title: "[Synthetic] Central Portal Synthesis", lane: 1.5, layer: 2, x: 557, y: 589, pinX: 559, pinY: 622 },
    { id: "stress-beta.m14", title: "[Synthetic] Midpoint Operational Authorization", lane: 0, layer: 3, x: 683, y: 489, pinX: 682, pinY: 520 },
    { id: "stress-beta.s15", title: "[Synthetic] Head Office Confirmation", lane: -1.5, layer: 4, x: 788, y: 335, pinX: 785, pinY: 366 },
    { id: "stress-beta.s16", title: "[Synthetic] Ward Physical Record Inspection", lane: -0.5, layer: 4, x: 818, y: 431, pinX: 815, pinY: 462 },
    { id: "stress-beta.s17", title: "[Synthetic] Fire Marshal Final Compliance", lane: 0.5, layer: 4, x: 853, y: 495, pinX: 850, pinY: 526 },
    { id: "stress-beta.s18", title: "[Synthetic] Hygiene Verification", lane: 1.5, layer: 4, x: 893, y: 565, pinX: 889, pinY: 596 },
    { id: "stress-beta.s19", title: "[Synthetic] Stamp and Revenue Assessment", lane: -1.5, layer: 5, x: 928, y: 313, pinX: 923, pinY: 344 },
    { id: "stress-beta.s20", title: "[Synthetic] Workplace Standards Confirmation", lane: -0.5, layer: 5, x: 967, y: 368, pinX: 962, pinY: 399 },
    { id: "stress-beta.s21", title: "[Synthetic] Jurisdictional Police Endorsement", lane: 1.5, layer: 5, x: 1049, y: 535, pinX: 1043, pinY: 566 },
    { id: "stress-beta.s22", title: "[Synthetic] Effluent & Noise Certification", lane: 0.5, layer: 5, x: 1003, y: 467, pinX: 997, pinY: 498 },
    { id: "stress-beta.s23", title: "[Synthetic] Utility Commissioning Check", lane: -1, layer: 6, x: 1076, y: 355, pinX: 1070, pinY: 385 },
    { id: "stress-beta.s24", title: "[Synthetic] Legal Attestation & Registry", lane: 0, layer: 6, x: 1122, y: 411, pinX: 1115, pinY: 441 },
    { id: "stress-beta.s25", title: "[Synthetic] Integrated Civic Registration Award", lane: 1, layer: 6, x: 1183, y: 434, pinX: 1174, pinY: 466 },
  ],
  headerBoxes: [
    { minX: 103, maxX: 243, minY: 288, maxY: 320 },
    { minX: 238, maxX: 378, minY: 268, maxY: 300 },
    { minX: 368, maxX: 508, minY: 250, maxY: 282 },
    { minX: 494, maxX: 634, minY: 232, maxY: 264 },
    { minX: 616, maxX: 756, minY: 214, maxY: 246 },
    { minX: 734, maxX: 874, minY: 197, maxY: 229 },
    { minX: 849, maxX: 989, minY: 181, maxY: 213 },
  ],
};

function runCollisionCheck(
  fixture: { pts: Array<ProjectedStationPoint & { lane: number; layer: number }>; headerBoxes: ScreenRect[] },
  viewport: { width: number; height: number }
) {
  const stations = fixture.pts.map((p) =>
    makeDummyStation(p.id, "available", "applies")
  );
  // Set real titles
  for (let i = 0; i < stations.length; i++) {
    stations[i]!.title = fixture.pts[i]!.title;
  }

  const projectedMap = new Map<string, ProjectedStationPoint>();
  for (const p of fixture.pts) {
    projectedMap.set(p.id, p);
  }

  const safeMinX = SAFE_INSETS.left;
  const safeMaxX = viewport.width - SAFE_INSETS.right;
  const safeMinY = SAFE_INSETS.top;
  const safeMaxY = viewport.height - SAFE_INSETS.bottom;

  // Clamped headers per StageHeaderProjector (H2 & P11)
  const clampedHeaders = fixture.headerBoxes.map((h) => {
    const halfW = (h.maxX - h.minX) / 2;
    const halfH = (h.maxY - h.minY) / 2;
    const cx = (h.minX + h.maxX) / 2;
    const cy = (h.minY + h.maxY) / 2;
    const clampedX = Math.max(safeMinX + halfW, Math.min(safeMaxX - halfW, cx));
    const clampedY = Math.max(safeMinY + halfH, Math.min(safeMaxY - halfH, cy));
    return {
      minX: clampedX - halfW,
      maxX: clampedX + halfW,
      minY: clampedY - halfH,
      maxY: clampedY + halfH,
    };
  });

  const placements = resolveLabelCollisions({
    stations,
    projectedPoints: projectedMap,
    stageHeaders: clampedHeaders,
    viewport,
  });

  const cards: ScreenRect[] = [];
  const pins: ScreenRect[] = [];
  let fullCards = 0;
  let compactCards = 0;
  let clippedCards = 0;

  for (const [, pl] of placements.entries()) {
    if (pl.mode === "full" || pl.mode === "compact") {
      cards.push(pl.rect);
      if (pl.mode === "full") fullCards++;
      if (pl.mode === "compact") compactCards++;
      if (
        pl.rect.minX < safeMinX - 0.001 ||
        pl.rect.maxX > safeMaxX + 0.001 ||
        pl.rect.minY < safeMinY - 0.001 ||
        pl.rect.maxY > safeMaxY + 0.001
      ) {
        clippedCards++;
      }
    } else if (pl.mode === "pin") {
      pins.push(pl.rect);
    }
  }

  let clippedHeaders = 0;
  for (const h of clampedHeaders) {
    if (
      h.minX < safeMinX - 0.001 ||
      h.maxX > safeMaxX + 0.001 ||
      h.minY < safeMinY - 0.001 ||
      h.maxY > safeMaxY + 0.001
    ) {
      clippedHeaders++;
    }
  }

  let cardCardOverlaps = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (rectsOverlap(cards[i]!, cards[j]!, 0)) {
        cardCardOverlaps++;
      }
    }
  }

  let pinCardOverlaps = 0;
  for (const pin of pins) {
    for (const card of cards) {
      if (rectsOverlap(pin, card, 0)) {
        pinCardOverlaps++;
      }
    }
  }

  let cardHeaderOverlaps = 0;
  for (const card of cards) {
    for (const h of clampedHeaders) {
      if (rectsOverlap(card, h, 0)) {
        cardHeaderOverlaps++;
      }
    }
  }

  return {
    totalStations: stations.length,
    placedCards: cards.length,
    fullCards,
    compactCards,
    clippedCards,
    clippedHeaders,
    placedPins: pins.length,
    cardCardOverlaps,
    pinCardOverlaps,
    cardHeaderOverlaps,
  };
}

describe("resolveLabelCollisions (G1 & G5)", () => {
  it("ensures no pin rect intersects a card rect and no two cards intersect for demo at 1440x900", () => {
    const res = runCollisionCheck(DEMO_1440, { width: 1440, height: 900 });
    expect(res.cardCardOverlaps).toBe(0);
    expect(res.pinCardOverlaps).toBe(0);
    expect(res.placedCards).toBe(13); // All 13 get labels
    expect(res.placedPins).toBe(0); // Small graphs never use pins
  });

  it("ensures no pin rect intersects a card rect and no two cards intersect for demo at 1280x800", () => {
    const res = runCollisionCheck(DEMO_1280, { width: 1280, height: 800 });
    expect(res.cardCardOverlaps).toBe(0);
    expect(res.pinCardOverlaps).toBe(0);
    expect(res.placedPins).toBe(0); // Small graphs never use pins
  });

  it("ensures no pin rect intersects a card rect and no two cards intersect for stress at 1440x900", () => {
    const res = runCollisionCheck(STRESS_1440, { width: 1440, height: 900 });
    expect(res.cardCardOverlaps).toBe(0);
    expect(res.pinCardOverlaps).toBe(0);
    expect(res.placedCards).toBeGreaterThanOrEqual(20);
  });

  it("ensures no pin rect intersects a card rect and no two cards intersect for stress at 1280x800", () => {
    const res = runCollisionCheck(STRESS_1280, { width: 1280, height: 800 });
    expect(res.cardCardOverlaps).toBe(0);
    expect(res.pinCardOverlaps).toBe(0);
    expect(res.placedCards).toBeGreaterThanOrEqual(18);
  });

  it("demo fixture at 1440x900 places at least 10 of 13 full cards with 0 overlaps and 0 clipped (H3)", () => {
    const res = runCollisionCheck(DEMO_1440, { width: 1440, height: 900 });
    expect(res.placedCards).toBe(13);
    expect(res.fullCards).toBeGreaterThanOrEqual(10);
    expect(res.cardCardOverlaps).toBe(0);
    expect(res.clippedCards).toBe(0);
    expect(res.clippedHeaders).toBe(0);
  });

  it("every card and header rect lies inside safe area for both demo and stress at 1440x900 and 1280x800 (H2)", () => {
    const demo1440 = runCollisionCheck(DEMO_1440, { width: 1440, height: 900 });
    expect(demo1440.clippedCards).toBe(0);
    expect(demo1440.clippedHeaders).toBe(0);

    const demo1280 = runCollisionCheck(DEMO_1280, { width: 1280, height: 800 });
    expect(demo1280.clippedCards).toBe(0);
    expect(demo1280.clippedHeaders).toBe(0);

    const stress1440 = runCollisionCheck(STRESS_1440, { width: 1440, height: 900 });
    expect(stress1440.clippedCards).toBe(0);
    expect(stress1440.clippedHeaders).toBe(0);

    const stress1280 = runCollisionCheck(STRESS_1280, { width: 1280, height: 800 });
    expect(stress1280.clippedCards).toBe(0);
    expect(stress1280.clippedHeaders).toBe(0);
  });

  it("ensures no card rect intersects a header rect for demo and stress (P12)", () => {
    const demo1440 = runCollisionCheck(DEMO_1440, { width: 1440, height: 900 });
    expect(demo1440.cardHeaderOverlaps).toBe(0);

    const demo1280 = runCollisionCheck(DEMO_1280, { width: 1280, height: 800 });
    expect(demo1280.cardHeaderOverlaps).toBe(0);

    const stress1440 = runCollisionCheck(STRESS_1440, { width: 1440, height: 900 });
    expect(stress1440.cardHeaderOverlaps).toBe(0);

    const stress1280 = runCollisionCheck(STRESS_1280, { width: 1280, height: 800 });
    expect(stress1280.cardHeaderOverlaps).toBe(0);
  });
});

