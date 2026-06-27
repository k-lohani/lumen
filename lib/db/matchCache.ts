import type { TrialVerdict } from "../types";
import { disableCache } from "../productConfig";
import { tryGetSupabaseAdmin } from "../supabase/server";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCachedVerdicts(
  patientUuid: string,
  chartHash: string
): Promise<{ verdicts: TrialVerdict[]; matched_at: string } | null> {
  if (disableCache()) return null;
  const db = tryGetSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("lumen_match_verdicts")
    .select("verdicts, generated_at")
    .eq("patient_id", patientUuid)
    .eq("chart_hash", chartHash)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const age = Date.now() - new Date(data.generated_at).getTime();
  if (age > CACHE_TTL_MS) return null;

  return {
    verdicts: data.verdicts as TrialVerdict[],
    matched_at: data.generated_at,
  };
}

export async function saveVerdicts(
  patientUuid: string,
  chartHash: string,
  verdicts: TrialVerdict[]
): Promise<string> {
  if (disableCache()) return new Date().toISOString();
  const db = tryGetSupabaseAdmin();
  if (!db) return new Date().toISOString();

  const { data: run, error: runError } = await db
    .from("lumen_match_runs")
    .insert({
      patient_id: patientUuid,
      chart_hash: chartHash,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to save match run: ${runError?.message}`);
  }

  const matchedAt = new Date().toISOString();
  const { error: verdictError } = await db.from("lumen_match_verdicts").insert({
    run_id: run.id,
    patient_id: patientUuid,
    chart_hash: chartHash,
    verdicts,
    generated_at: matchedAt,
  });

  if (verdictError) {
    throw new Error(`Failed to save verdicts: ${verdictError.message}`);
  }

  return matchedAt;
}
