import type {
  IngestedTrial,
  PipelineOptions,
  PipelineResult,
  RawChart,
  TrialVerdict,
} from "../types";
import { computeChartHash } from "../chartHash";
import { getCachedProfile, saveCachedProfile } from "../db/profileCache";
import { discoverTrialsForPatient } from "../clinicaltrials/discoverTrials";
import { attachResolvingActions, aggregateVerdict } from "./aggregate";
import { decomposeCriteria } from "./decomposeCriteria";
import { evaluateCriteria } from "./evaluateCriteria";
import { extractProfile } from "./extractProfile";
import { loadPinnedTrials } from "./ingestTrials";
import { computeReachabilityRank, rankVerdicts } from "./rank";
import { selectCohort } from "./selectCohort";

async function extractProfileCached(
  chart: RawChart,
  options: PipelineOptions
): Promise<Awaited<ReturnType<typeof extractProfile>>> {
  const chartHash = computeChartHash(chart);

  if (options.patientUuid && !options.useGoldenProfile) {
    const cached = await getCachedProfile(options.patientUuid, chartHash);
    if (cached) return cached;
  }

  const profile = await extractProfile(chart, {
    useGoldenProfile: options.useGoldenProfile,
  });

  if (options.patientUuid) {
    await saveCachedProfile(options.patientUuid, chartHash, profile);
  }

  return profile;
}

async function matchTrial(
  chart: RawChart,
  trial: IngestedTrial,
  profile: Awaited<ReturnType<typeof extractProfile>>,
  options: PipelineOptions
): Promise<TrialVerdict> {
  const { cohort, label } = await selectCohort(trial, profile, {
    pinnedMode: options.pinnedMode,
  });
  const criteria = await decomposeCriteria(trial, cohort);
  const scoped = criteria.filter(
    (c) => c.cohort_scope === "general" || c.cohort_scope === cohort
  );

  let results = await evaluateCriteria(scoped, chart, profile, {
    useRuleBased: options.pinnedMode,
  });
  results = attachResolvingActions(results);

  const { verdict, actionable_gap } = aggregateVerdict(results);
  const reachability_rank = computeReachabilityRank(
    verdict,
    results,
    actionable_gap
  );

  return {
    trial_id: trial.nct_id,
    trial_title: trial.title,
    phase: trial.phase,
    trial_status: trial.status,
    matched_cohort: cohort,
    cohort_label: label,
    registry_synced_at: trial.registry_synced_at,
    verdict,
    criteria: results,
    actionable_gap,
    reachability_rank,
  };
}

export async function runPipeline(
  chart: RawChart,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const profile = await extractProfileCached(chart, options);

  let trials: IngestedTrial[];
  let discovery;

  if (options.pinnedMode) {
    trials = await loadPinnedTrials();
    discovery = {
      discovered_trials: trials.length,
      search_summary: {
        condition: "pinned regression",
        terms: [],
        status: ["RECRUITING"],
        phases: [],
      },
      nct_ids: trials.map((t) => t.nct_id),
      from_cache: false,
    };
  } else {
    const result = await discoverTrialsForPatient(profile, {
      patientUuid: options.patientUuid,
      skipCache: options.skipDiscoveryCache,
    });
    trials = result.trials;
    discovery = result.discovery;
  }

  const verdicts = await Promise.all(
    trials.map((trial) => matchTrial(chart, trial, profile, options))
  );

  return {
    verdicts: rankVerdicts(verdicts),
    profile,
    discovery,
  };
}

export async function runMatch(
  chart: RawChart,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  return runPipeline(chart, options);
}
