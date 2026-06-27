import { disableCache } from "../productConfig";
import { tryGetSupabaseAdmin } from "../supabase/server";

export async function getCachedCohort(
  nctId: string,
  profileHash: string
): Promise<{ cohort: string; label: string } | null> {
  if (disableCache()) return null;

  const db = tryGetSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("lumen_trial_cohort_cache")
    .select("cohort_key, cohort_label")
    .eq("nct_id", nctId)
    .eq("profile_hash", profileHash)
    .maybeSingle();

  if (error || !data) return null;

  return { cohort: data.cohort_key, label: data.cohort_label };
}

export async function saveCachedCohort(
  nctId: string,
  profileHash: string,
  cohort: string,
  label: string
): Promise<void> {
  if (disableCache()) return;

  const db = tryGetSupabaseAdmin();
  if (!db) return;

  await db.from("lumen_trial_cohort_cache").upsert(
    {
      nct_id: nctId,
      profile_hash: profileHash,
      cohort_key: cohort,
      cohort_label: label,
    },
    { onConflict: "nct_id,profile_hash" }
  );
}
