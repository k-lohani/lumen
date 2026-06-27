import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { Criterion, IngestedTrial } from "../types";
import { computeEligibilityHash } from "../chartHash";
import {
  configuredTrialNcts,
  fetchStudies,
  TRIAL_COHORT_META,
  type CTGovStudy,
} from "../clinicaltrials/client";
import { tryGetSupabaseAdmin } from "../supabase/server";

export interface TrialSummary {
  nct_id: string;
  title: string;
  phase?: string;
  status: string;
  cohort_label: string;
  registry_updated_at: string | null;
  synced_at: string;
}

function loadTrialFromFile(nctId: string): IngestedTrial {
  const path = join(process.cwd(), "data", "trials", `${nctId}.json`);
  const pinned = JSON.parse(readFileSync(path, "utf-8")) as {
    nct_id: string;
    relevant_cohort: string;
    cohort_label: string;
    pinned_at: string;
    api_response: Record<string, unknown>;
  };
  const ps = pinned.api_response.protocolSection as {
    identificationModule?: { briefTitle?: string };
    statusModule?: { overallStatus?: string };
    designModule?: { phases?: string[] };
    eligibilityModule?: { eligibilityCriteria?: string };
  };
  const phases = ps.designModule?.phases ?? [];
  const phase = phases.length
    ? phases.map((p) => p.replace("PHASE", "Phase ").trim()).join("/")
    : undefined;

  return {
    nct_id: pinned.nct_id,
    title: ps.identificationModule?.briefTitle ?? nctId,
    phase,
    status: ps.statusModule?.overallStatus ?? "UNKNOWN",
    eligibility_text: ps.eligibilityModule?.eligibilityCriteria ?? "",
    relevant_cohort: pinned.relevant_cohort,
    cohort_label: pinned.cohort_label,
    registry_synced_at: pinned.pinned_at,
  };
}

function studyToIngested(study: CTGovStudy): IngestedTrial {
  return {
    nct_id: study.nctId,
    title: study.title,
    phase: study.phase,
    status: study.status,
    eligibility_text: study.eligibilityText,
    relevant_cohort: "general",
    cohort_label: "Pending routing",
    registry_synced_at: study.registryUpdatedAt ?? new Date().toISOString().slice(0, 10),
  };
}

export { studyToIngested };

function rowToIngested(row: {
  nct_id: string;
  title: string;
  phase: string | null;
  status: string;
  eligibility_text: string;
  relevant_cohort: string;
  cohort_label: string;
  registry_updated_at: string | null;
  synced_at: string;
}): IngestedTrial {
  return {
    nct_id: row.nct_id,
    title: row.title,
    phase: row.phase ?? undefined,
    status: row.status,
    eligibility_text: row.eligibility_text,
    relevant_cohort: row.relevant_cohort,
    cohort_label: row.cohort_label,
    registry_synced_at: row.registry_updated_at ?? row.synced_at.slice(0, 10),
  };
}

export async function loadPinnedTrials(): Promise<IngestedTrial[]> {
  return configuredTrialNcts().map(loadTrialFromFile);
}

export async function loadAllTrials(): Promise<IngestedTrial[]> {
  const db = tryGetSupabaseAdmin();
  if (!db) {
    const dir = join(process.cwd(), "data", "trials");
    const ids = readdirSync(dir)
      .filter(
        (f) =>
          f.startsWith("NCT") && f.endsWith(".json") && !f.endsWith("_raw.json")
      )
      .map((f) => f.replace(".json", ""));
    return ids.map(loadTrialFromFile);
  }

  const { data, error } = await db.from("lumen_trials").select("*");
  if (error || !data?.length) {
    return configuredTrialNcts().map(loadTrialFromFile);
  }
  return data.map(rowToIngested);
}

export async function loadTrialsByNctIds(
  nctIds: string[]
): Promise<TrialSummary[]> {
  if (!nctIds.length) return [];

  const db = tryGetSupabaseAdmin();
  const found = new Map<string, TrialSummary>();

  if (db) {
    const { data } = await db
      .from("lumen_trials")
      .select("*")
      .in("nct_id", nctIds);
    if (data?.length) {
      for (const row of data) {
        const t = rowToIngested(row);
        found.set(t.nct_id, {
          nct_id: t.nct_id,
          title: t.title,
          phase: t.phase,
          status: t.status,
          cohort_label: t.cohort_label,
          registry_updated_at: t.registry_synced_at,
          synced_at: t.registry_synced_at,
        });
      }
    }
  }

  for (const id of nctIds) {
    if (found.has(id)) continue;
    try {
      const t = loadTrialFromFile(id);
      found.set(id, {
        nct_id: t.nct_id,
        title: t.title,
        phase: t.phase,
        status: t.status,
        cohort_label: t.cohort_label,
        registry_updated_at: t.registry_synced_at,
        synced_at: t.registry_synced_at,
      });
    } catch {
      // fall through to CT.gov fetch
    }
  }

  const missing = nctIds.filter((id) => !found.has(id));
  if (missing.length) {
    const studies = await fetchStudies(missing);
    for (const study of studies) {
      await upsertTrialFromCTGov(study);
      const t = studyToIngested(study);
      found.set(t.nct_id, {
        nct_id: t.nct_id,
        title: t.title,
        phase: t.phase,
        status: t.status,
        cohort_label: t.cohort_label,
        registry_updated_at: t.registry_synced_at,
        synced_at: t.registry_synced_at,
      });
    }
  }

  return nctIds
    .map((id) => found.get(id))
    .filter((t): t is TrialSummary => t != null);
}

export async function listTrialSummaries(): Promise<TrialSummary[]> {
  const trials = await loadAllTrials();
  return trials.map((t) => ({
    nct_id: t.nct_id,
    title: t.title,
    phase: t.phase,
    status: t.status,
    cohort_label: t.cohort_label,
    registry_updated_at: t.registry_synced_at,
    synced_at: t.registry_synced_at,
  }));
}

export async function upsertTrialFromCTGov(study: CTGovStudy): Promise<void> {
  const db = tryGetSupabaseAdmin();
  if (!db) return;

  const meta = TRIAL_COHORT_META[study.nctId];

  await db.from("lumen_trials").upsert(
    {
      nct_id: study.nctId,
      title: study.title,
      phase: study.phase ?? null,
      status: study.status,
      eligibility_text: study.eligibilityText,
      relevant_cohort: meta?.relevant_cohort ?? "general",
      cohort_label: meta?.cohort_label ?? "Pending routing",
      registry_updated_at: study.registryUpdatedAt,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "nct_id" }
  );

  const hash = computeEligibilityHash(study.eligibilityText);
  const existing = await db
    .from("lumen_trial_criteria_cache")
    .select("eligibility_hash")
    .eq("nct_id", study.nctId)
    .limit(1);

  if (existing.data?.[0]?.eligibility_hash !== hash) {
    // eligibility changed — criteria cache invalidated on next decompose miss
  }
}

export async function syncAllTrialsFromRegistry(): Promise<TrialSummary[]> {
  const ncts = configuredTrialNcts();
  const studies = await fetchStudies(ncts);
  for (const study of studies) {
    await upsertTrialFromCTGov(study);
  }
  return listTrialSummaries();
}

export async function seedCriteriaCache(
  cohortKey: string,
  nctId: string,
  criteria: Criterion[],
  eligibilityHash: string
): Promise<void> {
  const db = tryGetSupabaseAdmin();
  if (!db) return;

  await db.from("lumen_trial_criteria_cache").upsert(
    {
      nct_id: nctId,
      cohort_key: cohortKey,
      criteria,
      eligibility_hash: eligibilityHash,
    },
    { onConflict: "cohort_key" }
  );
}
