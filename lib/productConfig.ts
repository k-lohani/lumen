/** Use pre-loaded trial portfolio from data/trials/ (only when LUMEN_USE_PINNED_TRIALS=1). */
export function usePinnedTrials(): boolean {
  return process.env.LUMEN_USE_PINNED_TRIALS === "1";
}

/** Live ClinicalTrials.gov search for trial discovery (default). */
export function useLiveDiscovery(): boolean {
  return !usePinnedTrials();
}

/** Prefer committed chart fixtures when Supabase is empty or unseeded. */
export function preferFileCharts(): boolean {
  return process.env.LUMEN_PREFER_FILE_CHARTS !== "0";
}

/** Use Claude for profile extraction and criterion evaluation (default when API key is set). */
export function useLiveLlm(): boolean {
  if (process.env.LUMEN_LIVE_LLM === "0") return false;
  if (process.env.LUMEN_LIVE_LLM === "1") return true;
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Skip all pipeline caches (profile, discovery, verdicts, criteria, cohort). Use for demos. */
export function disableCache(): boolean {
  return process.env.LUMEN_DISABLE_CACHE === "1";
}

/** Offline demo path — serve committed fixtures (env or request flag). */
export function isDemoMode(requestFlag?: boolean): boolean {
  if (requestFlag === true) return true;
  return process.env.LUMEN_DEMO_MODE === "1";
}

/** Max trials evaluated in demo mode (clean 3-verdict spine). */
export function demoTrialLimit(): number {
  const n = parseInt(process.env.LUMEN_DEMO_TRIAL_LIMIT ?? "3", 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}
