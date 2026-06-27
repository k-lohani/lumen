import { readFileSync } from "fs";
import { join } from "path";
import type { Criterion } from "../types";
import { tryGetSupabaseAdmin } from "../supabase/server";

function loadFileCache(trialId: string, cohort: string): Criterion[] | null {
  try {
    const path = join(process.cwd(), "data", "trials", "criteria-cache.json");
    const cache = JSON.parse(readFileSync(path, "utf-8")) as Record<
      string,
      Criterion[]
    >;
    return cache[`${trialId}:${cohort}`] ?? null;
  } catch {
    return null;
  }
}

export async function getCachedCriteria(
  trialId: string,
  cohort: string
): Promise<Criterion[] | null> {
  const fromFile = loadFileCache(trialId, cohort);
  if (fromFile) return fromFile;

  const db = tryGetSupabaseAdmin();
  if (!db) {
    return null;
  }

  const cohortKey = `${trialId}:${cohort}`;
  const { data, error } = await db
    .from("lumen_trial_criteria_cache")
    .select("criteria")
    .eq("cohort_key", cohortKey)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.criteria as Criterion[];
}

export async function setCachedCriteria(
  trialId: string,
  cohort: string,
  criteria: Criterion[],
  eligibilityHash: string
): Promise<void> {
  const db = tryGetSupabaseAdmin();
  if (!db) return;

  const cohortKey = `${trialId}:${cohort}`;
  await db.from("lumen_trial_criteria_cache").upsert(
    {
      nct_id: trialId,
      cohort_key: cohortKey,
      criteria,
      eligibility_hash: eligibilityHash,
    },
    { onConflict: "cohort_key" }
  );
}
