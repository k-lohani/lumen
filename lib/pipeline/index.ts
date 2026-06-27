import type {
  GeoFilter,
  IngestedTrial,
  PipelineOptions,
  PipelineProgressEvent,
  PipelineResult,
  RawChart,
  TrialVerdict,
} from "../types";
import { computeChartHash } from "../chartHash";
import { getCachedProfile, saveCachedProfile } from "../db/profileCache";
import { discoverTrialsForPatient } from "../clinicaltrials/discoverTrials";
import { enrichVerdictWithGeo } from "../clinicaltrials/geoSites";
import { disableCache } from "../productConfig";
import { attachResolvingActions, aggregateVerdict } from "./aggregate";
import { decomposeCriteria } from "./decomposeCriteria";
import { evaluateCriteria } from "./evaluateCriteria";
import { extractProfile } from "./extractProfile";
import { loadPinnedTrials } from "./ingestTrials";
import { mapPool } from "./mapPool";
import { buildPatientStory } from "./patientStory";
import { computeReachabilityRank, rankVerdicts } from "./rank";
import { selectCohort } from "./selectCohort";

const TRIAL_CONCURRENCY = 3;

function emit(
  options: PipelineOptions,
  event: PipelineProgressEvent
): void {
  options.onProgress?.(event);
}

function stageTimer() {
  const start = Date.now();
  return () => Date.now() - start;
}

async function extractProfileCached(
  chart: RawChart,
  options: PipelineOptions
): Promise<Awaited<ReturnType<typeof extractProfile>>> {
  const chartHash = computeChartHash(chart);
  const elapsed = stageTimer();

  emit(options, {
    type: "stage_start",
    stage: "profile",
    message: "Extracting patient profile from chart…",
  });

  if (options.patientUuid && !options.useGoldenProfile && !disableCache()) {
    const cached = await getCachedProfile(options.patientUuid, chartHash);
    if (cached) {
      emit(options, {
        type: "stage_end",
        stage: "profile",
        message: "Patient profile ready",
        duration_ms: elapsed(),
        meta: {
          primary: cached.diagnosis.primary,
          biomarkers: cached.biomarkers.map((b) => b.name),
        },
      });
      return cached;
    }
  }

  const profile = await extractProfile(chart, {
    useGoldenProfile: options.useGoldenProfile,
  });

  if (options.patientUuid && !disableCache()) {
    await saveCachedProfile(options.patientUuid, chartHash, profile);
  }

  emit(options, {
    type: "stage_end",
    stage: "profile",
    message: "Patient profile extracted",
    duration_ms: elapsed(),
    meta: {
      primary: profile.diagnosis.primary,
      biomarkers: profile.biomarkers.map((b) => b.name),
      prior_therapies: profile.prior_therapies.map((t) => t.name),
    },
  });

  return profile;
}

async function matchTrial(
  chart: RawChart,
  trial: IngestedTrial,
  profile: Awaited<ReturnType<typeof extractProfile>>,
  options: PipelineOptions,
  trialRaw?: Record<string, unknown>
): Promise<TrialVerdict> {
  const onProgress = options.onProgress;

  onProgress?.({
    type: "trial_step",
    nct_id: trial.nct_id,
    step: "cohort",
  });

  const { cohort, label } = await selectCohort(trial, profile, {
    pinnedMode: options.pinnedMode,
  });

  onProgress?.({
    type: "trial_step",
    nct_id: trial.nct_id,
    step: "cohort",
    meta: { cohort, label, reason: `Routed to ${label}` },
  });

  onProgress?.({
    type: "trial_step",
    nct_id: trial.nct_id,
    step: "decompose",
  });

  const criteria = await decomposeCriteria(trial, cohort);
  const scoped = criteria.filter(
    (c) => c.cohort_scope === "general" || c.cohort_scope === cohort
  );

  onProgress?.({
    type: "trial_step",
    nct_id: trial.nct_id,
    step: "decompose",
    meta: { criteria_count: scoped.length, cohort },
  });

  let results = await evaluateCriteria(scoped, chart, profile, {
    useRuleBased: options.useRuleBased ?? false,
    onProgress,
    nct_id: trial.nct_id,
  });
  results = attachResolvingActions(results);

  const { verdict, actionable_gap } = aggregateVerdict(results);
  const reachability_rank = computeReachabilityRank(
    verdict,
    results,
    actionable_gap
  );

  const base: TrialVerdict = {
    trial_id: trial.nct_id,
    trial_title: trial.title,
    phase: trial.phase,
    trial_status: trial.status,
    matched_cohort: cohort,
    cohort_label: label,
    registry_synced_at: trial.registry_synced_at,
    protocol_last_updated: trial.protocol_last_updated,
    verdict,
    criteria: results,
    actionable_gap,
    reachability_rank,
  };

  if (options.geoFilter && trialRaw) {
    return enrichVerdictWithGeo(base, trialRaw, options.geoFilter);
  }
  return base;
}

export async function runPipeline(
  chart: RawChart,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const skipDiscovery =
    disableCache() || options.skipDiscoveryCache || false;

  const profile = await extractProfileCached(chart, options);

  let trials: IngestedTrial[];
  let discovery;
  let studyRaws = new Map<string, Record<string, unknown>>();

  if (options.pinnedMode) {
    const elapsed = stageTimer();
    emit(options, {
      type: "stage_start",
      stage: "discovery",
      message: "Loading pinned trial portfolio…",
    });
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
    emit(options, {
      type: "stage_end",
      stage: "discovery",
      message: `Loaded ${trials.length} pinned trials`,
      duration_ms: elapsed(),
      meta: { count: trials.length, nct_ids: discovery.nct_ids },
    });
  } else {
    const geoLabel = options.geoFilter
      ? ` within ${options.geoFilter.radiusMi} mi of ${options.geoFilter.label}`
      : "";
    const elapsed = stageTimer();
    emit(options, {
      type: "stage_start",
      stage: "discovery",
      message: `Searching ClinicalTrials.gov${geoLabel}…`,
    });

    const result = await discoverTrialsForPatient(profile, {
      patientUuid: options.patientUuid,
      skipCache: skipDiscovery,
      geoFilter: options.geoFilter,
    });
    trials = result.trials;
    discovery = result.discovery;
    studyRaws = result.studyRaws;

    emit(options, {
      type: "stage_end",
      stage: "discovery",
      message: `Found ${trials.length} recruiting trials`,
      duration_ms: elapsed(),
      meta: {
        count: trials.length,
        from_cache: discovery.from_cache,
        condition: discovery.search_summary.condition,
        terms: discovery.search_summary.terms,
        nct_ids: discovery.nct_ids,
      },
    });
  }

  const total = trials.length;
  let completed = 0;
  const trialElapsed = stageTimer();

  emit(options, {
    type: "stage_start",
    stage: "trial",
    message: `Evaluating eligibility for ${total} trial${total === 1 ? "" : "s"}…`,
  });

  const verdicts: TrialVerdict[] = [];
  let trialFailures = 0;

  await mapPool(trials, TRIAL_CONCURRENCY, async (trial, index) => {
    const trialStart = stageTimer();
    emit(options, {
      type: "trial_start",
      nct_id: trial.nct_id,
      title: trial.title,
      index: index + 1,
      total,
    });

    try {
      const v = await matchTrial(
        chart,
        trial,
        profile,
        options,
        studyRaws.get(trial.nct_id)
      );

      verdicts.push(v);
      completed++;
      emit(options, {
        type: "trial_done",
        nct_id: trial.nct_id,
        verdict: v.verdict,
        index: completed,
        total,
        duration_ms: trialStart(),
      });
    } catch (error) {
      trialFailures++;
      console.error(`Trial ${trial.nct_id} evaluation failed:`, error);
      emit(options, {
        type: "error",
        message: `Could not evaluate ${trial.nct_id}`,
      });
    }
  });

  emit(options, {
    type: "stage_end",
    stage: "trial",
    message: "Eligibility analysis complete",
    duration_ms: trialElapsed(),
    meta: {
      eligible: verdicts.filter((v) => v.verdict === "ELIGIBLE").length,
      conditional: verdicts.filter(
        (v) => v.verdict === "CONDITIONALLY_ELIGIBLE"
      ).length,
      excluded: verdicts.filter((v) => v.verdict === "EXCLUDED").length,
    },
  });

  emit(options, {
    type: "stage_end",
    stage: "complete",
    message: "Pre-screen ready",
    duration_ms: 0,
  });

  return {
    verdicts: rankVerdicts(verdicts),
    profile,
    discovery,
    patient_story: buildPatientStory(profile, options.geoFilter),
    partial: trialFailures > 0 || undefined,
    partial_note:
      trialFailures > 0
        ? `${trialFailures} trial${trialFailures === 1 ? "" : "s"} could not be evaluated — showing ${verdicts.length} completed result${verdicts.length === 1 ? "" : "s"}.`
        : undefined,
  };
}

export async function runMatch(
  chart: RawChart,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  return runPipeline(chart, options);
}
