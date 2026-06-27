import type { SearchSummary } from "../types";
import { tryGetSupabaseAdmin } from "../supabase/server";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface DiscoveryCacheEntry {
  nct_ids: string[];
  search_params: SearchSummary;
  discovered_at: string;
}

export async function getDiscoveryCache(
  patientUuid: string,
  profileHash: string
): Promise<DiscoveryCacheEntry | null> {
  const db = tryGetSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("lumen_discovery_cache")
    .select("nct_ids, search_params, discovered_at")
    .eq("patient_id", patientUuid)
    .eq("profile_hash", profileHash)
    .maybeSingle();

  if (error || !data) return null;

  const age = Date.now() - new Date(data.discovered_at).getTime();
  if (age > CACHE_TTL_MS) return null;

  return {
    nct_ids: data.nct_ids as string[],
    search_params: data.search_params as SearchSummary,
    discovered_at: data.discovered_at,
  };
}

export async function saveDiscoveryCache(
  patientUuid: string,
  profileHash: string,
  nctIds: string[],
  searchParams: SearchSummary
): Promise<void> {
  const db = tryGetSupabaseAdmin();
  if (!db) return;

  await db.from("lumen_discovery_cache").upsert(
    {
      patient_id: patientUuid,
      profile_hash: profileHash,
      search_params: searchParams,
      nct_ids: nctIds,
      discovered_at: new Date().toISOString(),
    },
    { onConflict: "patient_id,profile_hash" }
  );
}

export async function getLastDiscoveryForPatient(
  patientUuid: string
): Promise<DiscoveryCacheEntry | null> {
  const db = tryGetSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("lumen_discovery_cache")
    .select("nct_ids, search_params, discovered_at")
    .eq("patient_id", patientUuid)
    .order("discovered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    nct_ids: data.nct_ids as string[],
    search_params: data.search_params as SearchSummary,
    discovered_at: data.discovered_at,
  };
}
