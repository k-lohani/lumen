const CTGOV_BASE = "https://clinicaltrials.gov/api/v2";
const REQUEST_DELAY_MS = 1000;

let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < REQUEST_DELAY_MS) {
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

import type { GeoFilter } from "../types";

export interface CTGovSearchParams {
  condition?: string;
  terms?: string[];
  intervention?: string;
  status?: string[];
  phases?: string[];
  geo?: GeoFilter;
  pageSize?: number;
  pageToken?: string;
}

export interface CTGovSearchResult {
  studies: CTGovStudy[];
  nextPageToken?: string;
  totalCount?: number;
}

export interface CTGovStudy {
  nctId: string;
  title: string;
  phase?: string;
  status: string;
  eligibilityText: string;
  registryUpdatedAt: string | null;
  raw: Record<string, unknown>;
}

interface ProtocolSection {
  identificationModule?: { briefTitle?: string; nctId?: string };
  statusModule?: {
    overallStatus?: string;
    lastUpdatePostDateStruct?: { date?: string };
  };
  designModule?: { phases?: string[] };
  eligibilityModule?: { eligibilityCriteria?: string };
}

function parseStudy(raw: Record<string, unknown>): CTGovStudy {
  const ps = (raw.protocolSection ?? {}) as ProtocolSection;
  const phases = ps.designModule?.phases ?? [];
  const phase = phases.length
    ? phases.map((p) => p.replace("PHASE", "Phase ").trim()).join("/")
    : undefined;

  return {
    nctId: ps.identificationModule?.nctId ?? "UNKNOWN",
    title: ps.identificationModule?.briefTitle ?? "Untitled study",
    phase,
    status: ps.statusModule?.overallStatus ?? "UNKNOWN",
    eligibilityText: ps.eligibilityModule?.eligibilityCriteria ?? "",
    registryUpdatedAt:
      ps.statusModule?.lastUpdatePostDateStruct?.date ?? null,
    raw,
  };
}

export async function fetchStudy(nctId: string): Promise<CTGovStudy> {
  const res = await fetch(`${CTGOV_BASE}/studies/${nctId}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov fetch failed for ${nctId}: ${res.status}`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  return parseStudy(raw);
}

export async function fetchStudies(nctIds: string[]): Promise<CTGovStudy[]> {
  if (nctIds.length === 0) return [];
  const params = new URLSearchParams({
    "filter.ids": nctIds.join(","),
    pageSize: String(Math.min(nctIds.length, 100)),
  });
  const res = await fetch(`${CTGOV_BASE}/studies?${params}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov batch fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { studies?: Record<string, unknown>[] };
  return (data.studies ?? []).map(parseStudy);
}

export async function searchStudies(
  params: CTGovSearchParams
): Promise<CTGovSearchResult> {
  await throttle();

  const searchParams = new URLSearchParams();
  if (params.condition) searchParams.set("query.cond", params.condition);
  if (params.terms?.length) {
    searchParams.set("query.term", params.terms.join(" "));
  }
  if (params.intervention) {
    searchParams.set("query.intr", params.intervention);
  }
  if (params.status?.length) {
    searchParams.set("filter.overallStatus", params.status.join(","));
  }
  if (params.phases?.length) {
    const phaseFilter = params.phases
      .map((p) => `AREA[Phase]${p}`)
      .join(" OR ");
    searchParams.set("filter.advanced", phaseFilter);
  }
  if (params.geo) {
    const { lat, lng, radiusMi } = params.geo;
    searchParams.set(
      "filter.geo",
      `distance(${lat},${lng},${radiusMi}mi)`
    );
  }
  searchParams.set("pageSize", String(params.pageSize ?? 25));
  searchParams.set("sort", "LastUpdatePostDate:desc");
  if (params.pageToken) {
    searchParams.set("pageToken", params.pageToken);
  }

  const res = await fetch(`${CTGOV_BASE}/studies?${searchParams}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov search failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    studies?: Record<string, unknown>[];
    nextPageToken?: string;
    totalCount?: number;
  };

  return {
    studies: (data.studies ?? []).map(parseStudy),
    nextPageToken: data.nextPageToken,
    totalCount: data.totalCount,
  };
}

export async function searchAllStudies(
  params: CTGovSearchParams,
  maxResults = 25
): Promise<CTGovStudy[]> {
  const collected: CTGovStudy[] = [];
  let pageToken: string | undefined;

  while (collected.length < maxResults) {
    const pageSize = Math.min(100, maxResults - collected.length);
    const result = await searchStudies({ ...params, pageSize, pageToken });
    collected.push(...result.studies);
    if (!result.nextPageToken || result.studies.length === 0) break;
    pageToken = result.nextPageToken;
  }

  return collected.slice(0, maxResults);
}

export function configuredDiscoveryStatuses(): string[] {
  const env = process.env.LUMEN_CTGOV_STATUS;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return ["RECRUITING"];
}

export function configuredDiscoveryPhases(): string[] {
  const env = process.env.LUMEN_CTGOV_PHASES;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return ["PHASE2", "PHASE3", "PHASE4"];
}

export function maxDiscoveredTrials(): number {
  const n = parseInt(process.env.LUMEN_MAX_DISCOVERED_TRIALS ?? "10", 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export function pinnedNctsForDiscovery(): string[] {
  const env = process.env.LUMEN_PINNED_NCTS;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export function configuredTrialNcts(): string[] {
  const env = process.env.LUMEN_TRIAL_NCTS;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return ["NCT07070232", "NCT06348927", "NCT07174388"];
}

export const TRIAL_COHORT_META: Record<
  string,
  { relevant_cohort: string; cohort_label: string }
> = {
  NCT07070232: {
    relevant_cohort: "1C",
    cohort_label:
      "Cohort 1C — EGFR exon 19del/L858R, 1–2 prior lines incl. 3rd-gen TKI, progressed",
  },
  NCT06348927: {
    relevant_cohort: "general",
    cohort_label: "General eligibility — first-line treatment-naïve",
  },
  NCT07174388: {
    relevant_cohort: "9",
    cohort_label:
      "Cohort 9 — EGFR mutations, second line or later after osimertinib monotherapy",
  },
};

export function humanizeTrialStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
