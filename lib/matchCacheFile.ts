import { readFileSync } from "fs";
import { join } from "path";
import type { TrialVerdict } from "./types";

interface FileCacheEntry {
  chart_hash?: string;
  generated_at: string;
  verdicts: TrialVerdict[];
}

interface HeroVerdictsFile {
  [slug: string]: FileCacheEntry;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function loadHeroFileCache(
  slug: string,
  chartHash: string
): { verdicts: TrialVerdict[]; matched_at: string } | null {
  try {
    const path = join(process.cwd(), "data", "cache", "hero-verdicts.json");
    const cache = JSON.parse(readFileSync(path, "utf-8")) as HeroVerdictsFile;
    const entry = cache[slug];
    if (!entry?.verdicts?.length) return null;

    if (entry.chart_hash && entry.chart_hash !== chartHash) return null;

    const age = Date.now() - new Date(entry.generated_at).getTime();
    if (age > CACHE_TTL_MS) return null;

    return {
      verdicts: entry.verdicts,
      matched_at: entry.generated_at,
    };
  } catch {
    return null;
  }
}

export function normalizeVerdicts(verdicts: TrialVerdict[]): TrialVerdict[] {
  return verdicts.map((v) => ({
    ...v,
    trial_status: v.trial_status ?? "RECRUITING",
    registry_synced_at:
      v.registry_synced_at ??
      (v as TrialVerdict & { pinned_at?: string }).pinned_at ??
      new Date().toISOString().slice(0, 10),
  }));
}
