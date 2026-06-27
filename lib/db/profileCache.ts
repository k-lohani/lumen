import type { PatientProfile } from "../types";
import { disableCache } from "../productConfig";
import { tryGetSupabaseAdmin } from "../supabase/server";

export async function getCachedProfile(
  patientUuid: string,
  chartHash: string
): Promise<PatientProfile | null> {
  if (disableCache()) return null;
  const db = tryGetSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("lumen_patients")
    .select("profile_json, profile_chart_hash")
    .eq("id", patientUuid)
    .maybeSingle();

  if (error || !data?.profile_json || data.profile_chart_hash !== chartHash) {
    return null;
  }

  return data.profile_json as PatientProfile;
}

export async function saveCachedProfile(
  patientUuid: string,
  chartHash: string,
  profile: PatientProfile
): Promise<void> {
  if (disableCache()) return;
  const db = tryGetSupabaseAdmin();
  if (!db) return;

  await db
    .from("lumen_patients")
    .update({
      profile_json: profile,
      profile_chart_hash: chartHash,
      profile_extracted_at: new Date().toISOString(),
    })
    .eq("id", patientUuid);
}
