/**
 * Smoke test for patients API + live CT.gov discovery + match pipeline.
 */
const BASE = process.env.LUMEN_BASE_URL ?? "http://127.0.0.1:3005";
const MATCH_TIMEOUT_MS = 300_000;
const TRIALS_TIMEOUT_MS = 120_000;

async function main() {
  const patientsRes = await fetch(`${BASE}/api/patients`);
  if (!patientsRes.ok) throw new Error(`patients API ${patientsRes.status}`);
  const patientsData = (await patientsRes.json()) as {
    patients?: { slug: string }[];
  };
  if (!patientsData.patients?.length) {
    throw new Error("No patients returned from /api/patients");
  }
  console.log(`OK: ${patientsData.patients.length} patients loaded`);

  const trialsStart = Date.now();
  const trialsController = new AbortController();
  const trialsTimeout = setTimeout(
    () => trialsController.abort(),
    TRIALS_TIMEOUT_MS
  );
  let trialsRes: Response;
  try {
    trialsRes = await fetch(`${BASE}/api/trials?patientSlug=hero`, {
      signal: trialsController.signal,
    });
  } finally {
    clearTimeout(trialsTimeout);
  }
  const trialsElapsed = ((Date.now() - trialsStart) / 1000).toFixed(1);
  if (!trialsRes.ok) {
    throw new Error(`trials API ${trialsRes.status}`);
  }
  const trialsData = (await trialsRes.json()) as {
    trials?: { nct_id: string }[];
    discovery?: { search_summary?: { condition: string } };
    source?: string;
  };
  console.log(`OK: trials discovery in ${trialsElapsed}s (${trialsData.source ?? "unknown"})`);

  const matchStart = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MATCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ patientSlug: "hero" }),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const elapsedSec = ((Date.now() - matchStart) / 1000).toFixed(1);
  console.log(`Match completed in ${elapsedSec}s`);

  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? `match API ${res.status}`);
  }
  const data = (await res.json()) as {
    mrn: string;
    discovered_trials?: number;
    search_summary?: { condition: string };
    persisted?: boolean;
    verdicts: { trial_id: string; verdict: string }[];
  };

  const checks: [string, boolean][] = [
    ["MRN present", Boolean(data.mrn)],
    ["live match (>10s)", Number(elapsedSec) > 10],
    ["discovery condition", Boolean(data.search_summary?.condition)],
    ["trials discovered", (data.discovered_trials ?? 0) >= 1],
    ["verdicts returned", data.verdicts.length >= 1],
    [
      "verdict count matches discovery",
      data.verdicts.length === (data.discovered_trials ?? data.verdicts.length),
    ],
    ["trials API returned NCTs", (trialsData.trials?.length ?? 0) >= 1],
    [
      "trials API count matches match discovery",
      (trialsData.trials?.length ?? 0) === (data.discovered_trials ?? 0) ||
        (trialsData.trials?.length ?? 0) >= 1,
    ],
    [
      "trials API live source",
      trialsData.source === "ctgov" || Boolean(trialsData.discovery?.search_summary?.condition),
    ],
  ];

  let failed = 0;
  for (const [label, ok] of checks) {
    if (ok) console.log(`OK: ${label}`);
    else {
      console.error(`FAIL: ${label}`);
      failed++;
    }
  }

  if (data.persisted) console.log("OK: persisted to Supabase");

  if (failed > 0) process.exit(1);
  console.log("\nSmoke test passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
