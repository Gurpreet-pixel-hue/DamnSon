import type { ComposedJourney, ComposedStep } from "@/lib/contract/compose";
import { isOfficialUrl } from "@/lib/contract/officialSources";
import { deriveStepStates } from "./progress";
import { formatINR } from "./summary";

export interface DrawerOverviewModel {
  description: string | null;
  requirement: {
    kind: "mandatory" | "conditional" | "optional";
    text: string;
    applicability: "applies" | "may_apply" | "optional";
  };
  office: {
    name: string;
    address: string;
    hours: string;
    ward: string | null;
    mapsUrl: string | null;
    locationNote: string | null;
  } | null;
  portal: {
    name: string;
    url: string | null;
  } | null;
  forms: Array<{
    name: string;
    code?: string;
    url?: string;
  }>;
  emptyFormsMessage: string | null;
  unfinishedPrerequisites: Array<{
    id: string;
    title: string;
    edgeNote?: string;
  }>;
}

export interface DrawerDocumentItem {
  key: string;
  name: string;
  label: string;
  personLabel?: string;
  acceptedFormats: string | null;
  maxSize: string | null;
  note: string | null;
  isChecked: boolean;
}

export interface DrawerDocumentsModel {
  documents: DrawerDocumentItem[];
  outputs: Array<{
    documentTypeId: string;
    name: string;
  }>;
  emptyMessage: string | null;
}

export interface DrawerFeesModel {
  feeKind: "free" | "fixed" | "range" | "variable" | "unknown";
  feeDisplayText: string;
  feeRecurrenceLabel: string | null;
  feeNote: string | null;
  slaKind: "sla" | "no_fixed_sla" | "unknown";
  slaDisplayText: string;
  slaWording: string | null;
  conditionalTimelines: Array<{
    condition: string;
    durationText: string;
  }>;
}

export interface DrawerSourceItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  kind: string;
  kindLabel: string;
  retrievedOn: string;
  lastCheckedOn: string | null;
  isOfficial: boolean;
}

export interface DrawerSourcesModel {
  sources: DrawerSourceItem[];
  review: {
    status: "verified" | "unverified" | "flagged";
    statusLabel: string;
    verifiedOn: string | null;
    note: string | null;
  } | null;
  emptyMessage: string | null;
}

export interface StepDrawerModel {
  id: string;
  title: string;
  department: string;
  kind: "government" | "non_government" | "milestone";
  state: "done" | "available" | "locked";
  isDone: boolean;
  isAvailable: boolean;
  isLocked: boolean;
  canMarkDone: boolean;
  mode: "online" | "in_person" | "hybrid" | null;
  modeLabel: string | null;
  overview: DrawerOverviewModel;
  documents: DrawerDocumentsModel;
  fees: DrawerFeesModel;
  sources: DrawerSourcesModel;
}

const KIND_LABELS: Record<string, string> = {
  portal: "Portal",
  form: "Form",
  guideline: "Guideline",
  fee_schedule: "Fee schedule",
  act_or_rule: "Act / Rule",
  faq: "FAQ",
  circular: "Circular",
  other: "Other reference",
};

/**
 * Derives the strict view model for RightDrawer tabs per §8.8 and FE-4 Amendments:
 * 1. Never invent text (missing fields render 'not verified', empty description hidden).
 * 2. Office shown only for in_person and hybrid; online shows portal or 'Portal not verified'.
 * 3. Maps link only from lat/lng or address, otherwise 'Location not verified'.
 */
export function buildStepDrawerModel(
  step: ComposedStep,
  journey: ComposedJourney,
  completedSet: ReadonlySet<string>,
  documentChecklist: Record<string, boolean> = {}
): StepDrawerModel {
  const stepStates = deriveStepStates(journey, completedSet);
  const state = stepStates.get(step.id) ?? "locked";
  const isDone = state === "done";
  const isAvailable = state === "available";
  const isLocked = state === "locked";
  const isMilestone = step.kind === "milestone";
  const canMarkDone = !isMilestone && !isLocked;

  // Mode label
  let modeLabel: string | null = null;
  if (!isMilestone) {
    if (step.mode === "online") modeLabel = "Online · from home";
    else if (step.mode === "in_person") modeLabel = "In person · visit the office";
    else if (step.mode === "hybrid") modeLabel = "Online + office visit";
  }

  // Description: hide if empty string
  const rawDesc = step.description?.trim();
  const description = rawDesc && rawDesc.length > 0 ? rawDesc : null;

  // Requirement
  let requirementText = "Mandatory";
  if (step.requirement.kind === "conditional") {
    requirementText = step.requirement.condition;
  } else if (step.requirement.kind === "optional") {
    requirementText = step.requirement.note ?? "Optional";
  }

  // Office & Portal
  let office: DrawerOverviewModel["office"] = null;
  let portal: DrawerOverviewModel["portal"] = null;

  if (!isMilestone) {
    if (step.mode === "in_person" || step.mode === "hybrid") {
      const officeName = step.office?.name?.trim() || "Office not verified";
      const officeAddr = step.office?.address?.trim() || "Address not verified";
      const officeHours = step.office?.hours?.trim() || "Hours not verified";
      const officeWard = step.office?.ward?.trim() || null;

      let mapsUrl: string | null = null;
      let locationNote: string | null = null;

      if (step.office?.lat !== undefined && step.office?.lng !== undefined) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${step.office.lat},${step.office.lng}`;
      } else if (step.office?.address && step.office.address.trim().length > 0) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${step.office.name ?? ""} ${step.office.address}`.trim()
        )}`;
      } else {
        locationNote = "Location not verified";
      }

      office = {
        name: officeName,
        address: officeAddr,
        hours: officeHours,
        ward: officeWard,
        mapsUrl,
        locationNote,
      };
    }

    if (step.mode === "online") {
      if (step.applicationPortal?.url) {
        portal = {
          name: step.applicationPortal.name,
          url: step.applicationPortal.url,
        };
      } else {
        portal = {
          name: "Portal not verified",
          url: null,
        };
      }
    } else if (step.applicationPortal?.url) {
      portal = {
        name: step.applicationPortal.name,
        url: step.applicationPortal.url,
      };
    }
  }

  // Forms
  const rawForms = !isMilestone && step.forms ? step.forms : [];
  const forms = rawForms.map((f) => ({
    name: f.name,
    ...(f.code ? { code: f.code } : {}),
    ...(f.url ? { url: f.url } : {}),
  }));
  const emptyFormsMessage = forms.length === 0 ? "No forms listed" : null;

  // Unfinished Prerequisites with edge notes
  const unfinishedPrerequisites: DrawerOverviewModel["unfinishedPrerequisites"] = [];
  if (isLocked) {
    const reqEdges = journey.edges.filter((e) => e.to === step.id && e.kind === "requires");
    const stepMap = new Map(journey.steps.map((s) => [s.id, s]));
    for (const edge of reqEdges) {
      const prereq = stepMap.get(edge.from);
      if (prereq && prereq.applicability !== "may_apply" && stepStates.get(prereq.id) !== "done") {
        unfinishedPrerequisites.push({
          id: prereq.id,
          title: prereq.title,
          ...(edge.note ? { edgeNote: edge.note } : {}),
        });
      }
    }
  }

  const overview: DrawerOverviewModel = {
    description,
    requirement: {
      kind: step.requirement.kind,
      text: requirementText,
      applicability: step.applicability,
    },
    office,
    portal,
    forms,
    emptyFormsMessage,
    unfinishedPrerequisites,
  };

  // Documents
  const rawDocs = !isMilestone && step.documents ? step.documents : [];
  const documents: DrawerDocumentItem[] = rawDocs.map((d) => {
    let maxSize: string | null = null;
    if (d.maxSizeKB) {
      maxSize = d.maxSizeKB >= 1024 ? `${Math.round(d.maxSizeKB / 1024)} MB` : `${d.maxSizeKB} KB`;
    }
    return {
      key: d.key,
      name: d.name,
      label: d.personLabel ? `${d.name} (${d.personLabel})` : d.name,
      ...(d.personLabel ? { personLabel: d.personLabel } : {}),
      acceptedFormats: d.acceptedFormats && d.acceptedFormats.length > 0 ? d.acceptedFormats.join(", ") : null,
      maxSize,
      note: d.note ?? null,
      isChecked: Boolean(documentChecklist[d.key]),
    };
  });

  const rawOutputs = !isMilestone && step.outputs ? step.outputs : [];
  const outputs = rawOutputs.map((o) => ({
    documentTypeId: o.documentTypeId,
    name: o.name,
  }));

  const documentsModel: DrawerDocumentsModel = {
    documents,
    outputs,
    emptyMessage: documents.length === 0 && outputs.length === 0 ? "No documents listed" : null,
  };

  // Fees & SLA
  let feeKind: DrawerFeesModel["feeKind"] = "unknown";
  let feeDisplayText = "Fee: not verified";
  let feeRecurrenceLabel: string | null = null;
  let feeNote: string | null = null;

  let slaKind: DrawerFeesModel["slaKind"] = "unknown";
  let slaDisplayText = "SLA: not verified";
  let slaWording: string | null = null;
  const conditionalTimelines: DrawerFeesModel["conditionalTimelines"] = [];

  if (!isMilestone) {
    feeKind = step.fee.kind;
    feeNote = step.fee.note ?? null;

    if (step.fee.kind === "free") {
      feeDisplayText = "Free";
    } else if (step.fee.kind === "fixed") {
      feeDisplayText = formatINR(step.fee.amountINR);
      feeRecurrenceLabel = step.fee.recurrence === "annual" ? "Annual" : "One-time";
    } else if (step.fee.kind === "range") {
      feeDisplayText = `${formatINR(step.fee.minINR)}–${formatINR(step.fee.maxINR)}`;
      feeRecurrenceLabel = step.fee.recurrence === "annual" ? "Annual" : "One-time";
    } else if (step.fee.kind === "variable") {
      feeDisplayText = `Variable: ${step.fee.note}`;
      if (step.fee.recurrence) {
        feeRecurrenceLabel = step.fee.recurrence === "annual" ? "Annual" : "One-time";
      }
    } else {
      feeDisplayText = "Fee: not verified";
    }

    const sla = step.timeline.officialSla;
    slaKind = sla.kind;
    if (sla.kind === "sla") {
      slaDisplayText = `${sla.duration.minDays}–${sla.duration.maxDays} ${sla.duration.dayType} days`;
      slaWording = sla.wording ?? null;
    } else if (sla.kind === "no_fixed_sla") {
      slaDisplayText = `No fixed SLA: ${sla.note}`;
    } else {
      slaDisplayText = "SLA: not verified";
      slaWording = sla.note ?? null;
    }

    if (step.timeline.conditional) {
      for (const c of step.timeline.conditional) {
        let dur = "";
        if (c.duration.kind === "range") {
          dur = `${c.duration.minDays}–${c.duration.maxDays} ${c.duration.dayType} days`;
        } else {
          dur = `Open-ended: ${c.duration.note}`;
        }
        conditionalTimelines.push({
          condition: c.condition,
          durationText: dur,
        });
      }
    }
  }

  const feesModel: DrawerFeesModel = {
    feeKind,
    feeDisplayText,
    feeRecurrenceLabel,
    feeNote,
    slaKind,
    slaDisplayText,
    slaWording,
    conditionalTimelines,
  };

  // Sources & Review
  const rawSources = !isMilestone && step.sources ? step.sources : [];
  const sourcesList: DrawerSourceItem[] = rawSources.map((s) => {
    let domain = "";
    try {
      domain = new URL(s.url).hostname;
    } catch {
      domain = s.url;
    }
    return {
      id: s.id,
      title: s.title,
      url: s.url,
      domain,
      kind: s.kind,
      kindLabel: KIND_LABELS[s.kind] ?? "Reference",
      retrievedOn: `Retrieved on ${s.retrievedOn}`,
      lastCheckedOn: s.lastCheckedOn ? `Last checked on ${s.lastCheckedOn}` : null,
      isOfficial: isOfficialUrl(s.url),
    };
  });

  let review: DrawerSourcesModel["review"] = null;
  if (!isMilestone && step.review) {
    const rev = step.review;
    const statusLabel =
      rev.status === "verified" ? "Verified" : rev.status === "flagged" ? "Flagged" : "Unverified";
    review = {
      status: rev.status,
      statusLabel,
      verifiedOn: rev.status === "verified" ? `Verified on ${rev.verifiedOn}` : null,
      note: rev.note ?? null,
    };
  }

  const sourcesModel: DrawerSourcesModel = {
    sources: sourcesList,
    review,
    emptyMessage: sourcesList.length === 0 ? "Source unverified" : null,
  };

  return {
    id: step.id,
    title: step.title,
    department: isMilestone ? "Milestone" : step.department,
    kind: step.kind,
    state,
    isDone,
    isAvailable,
    isLocked,
    canMarkDone,
    mode: isMilestone ? null : step.mode,
    modeLabel,
    overview,
    documents: documentsModel,
    fees: feesModel,
    sources: sourcesModel,
  };
}
