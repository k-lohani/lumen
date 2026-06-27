import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { computeChartHash } from "../lib/chartHash";
import { enrichVerdictWithGeo } from "../lib/clinicaltrials/geoSites";
import { NYC_GEO_DEFAULT } from "../lib/demo/constants";
import { normalizeVerdicts } from "../lib/matchCacheFile";
import { runPipeline } from "../lib/pipeline/index";
import { naiveBaselinePredict } from "../eval/baseline";
import type {
  PatientProfile,
  RawChart,
  SearchSummary,
  TrialVerdict,
} from "../lib/types";

config({ path: join(process.cwd(), ".env") });

const DEMO_DIR = join(process.cwd(), "data", "demo");
const TRIALS_DIR = join(process.cwd(), "data", "trials");

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function loadTrialRaw(nctId: string): Record<string, unknown> {
  const trial = loadJson<{ api_response: Record<string, unknown> }>(
    join(TRIALS_DIR, `${nctId}.json`)
  );
  return trial.api_response;
}

const PATIENT_STORY =
  "Margaret Chen is a 58-year-old woman with Stage IV EGFR-mutant lung adenocarcinoma who progressed on first-line osimertinib. Her coordinator needs to pre-screen her against recruiting trials near New York.";

const SEARCH_SUMMARY: SearchSummary = {
  condition: "non-small cell lung cancer",
  terms: ["EGFR exon 19 deletion", "osimertinib"],
  status: ["RECRUITING"],
  phases: ["PHASE2", "PHASE3", "PHASE4"],
  geo: NYC_GEO_DEFAULT,
};

async function main() {
  mkdirSync(DEMO_DIR, { recursive: true });

  const heroChart = loadJson<RawChart>(
    join(process.cwd(), "data/charts/hero.json")
  );
  const echoChart = loadJson<RawChart>(
    join(process.cwd(), "data/charts/variant-echo-on-file.json")
  );
  const heroProfile = loadJson<PatientProfile>(
    join(process.cwd(), "data/charts/hero.profile.golden.json")
  );

  const cache = loadJson<{
    hero: { generated_at: string; verdicts: TrialVerdict[] };
  }>(join(process.cwd(), "data/cache/hero-verdicts.json"));

  let verdicts = normalizeVerdicts(cache.hero.verdicts);
  verdicts = verdicts.map((v) =>
    enrichVerdictWithGeo(v, loadTrialRaw(v.trial_id), NYC_GEO_DEFAULT)
  );

  const goldenMatch = {
    patientSlug: "hero",
    mrn: "MRN-48291",
    display_name: "Margaret Chen",
    matched_at: cache.hero.generated_at,
    profile: heroProfile,
    patient_story: PATIENT_STORY,
    discovered_trials: verdicts.length,
    search_summary: SEARCH_SUMMARY,
    verdicts,
    demo: true as const,
  };

  writeFileSync(
    join(DEMO_DIR, "golden-match.json"),
    JSON.stringify(goldenMatch, null, 2)
  );

  const goldenProfile = {
    profile: heroProfile,
    chart_hash: computeChartHash(heroChart),
    patient_story: PATIENT_STORY,
  };
  writeFileSync(
    join(DEMO_DIR, "golden-profile.json"),
    JSON.stringify(goldenProfile, null, 2)
  );

  const highlightId = "NCT07070232-EX01";
  const naiveResults = verdicts.flatMap((trial) =>
    trial.criteria.map((c) => ({
      criterion_id: c.criterion.criterion_id,
      trial_id: trial.trial_id,
      state: naiveBaselinePredict({
        patient_id: "hero",
        trial_id: trial.trial_id,
        criterion_id: c.criterion.criterion_id,
        criterion_text: c.criterion.text,
        type: c.criterion.type,
        gold_state: c.state,
      }) as "MET" | "NOT_MET",
      rationale:
        c.criterion.criterion_id === highlightId
          ? "Naive model guesses without chart evidence (no echo on file)."
          : "Heuristic keyword match — forced MET/NOT_MET, no citation.",
    }))
  );

  writeFileSync(
    join(DEMO_DIR, "naive-baseline.json"),
    JSON.stringify(
      {
        patient_id: "hero",
        highlight_criterion_id: highlightId,
        results: naiveResults,
      },
      null,
      2
    )
  );

  const echoResult = await runPipeline(echoChart, {
    pinnedMode: true,
    useGoldenProfile: true,
  });
  const echoTrial = echoResult.verdicts.find((v) => v.trial_id === "NCT07070232");
  if (!echoTrial) {
    throw new Error("NCT07070232 not found in echo variant pipeline output");
  }

  writeFileSync(
    join(DEMO_DIR, "resolution-after-echo.json"),
    JSON.stringify(
      {
        trial_id: "NCT07070232",
        verdict: normalizeVerdicts([echoTrial])[0],
        injected_line: {
          id: "L0009",
          section: "Cardiac",
          text: "Transthoracic echocardiogram 2026-06-08: LVEF 58% (normal systolic function).",
        },
      },
      null,
      2
    )
  );

  const pasteSample = {
    ...goldenMatch,
    patientSlug: "paste-demo",
    display_name: "Demo Patient (pasted note)",
    mrn: "PASTE-001",
    paste_preview:
      "58F Stage IV lung adeno · EGFR ex19 · post-osimertinib PD · ECOG 1 · no echo on file",
  };
  writeFileSync(
    join(DEMO_DIR, "paste-sample.json"),
    JSON.stringify(pasteSample, null, 2)
  );

  console.log("Wrote demo fixtures to data/demo/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
