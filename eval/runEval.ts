import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadChart } from "../lib/charts";
import { extractProfile } from "../lib/pipeline/extractProfile";
import { loadPinnedTrial } from "../lib/pipeline/ingestTrials";
import { decomposeCriteria } from "../lib/pipeline/decomposeCriteria";
import { evaluateCriteria } from "../lib/pipeline/evaluateCriteria";
import type { CriterionState, EvalMetrics, LabeledPair } from "../lib/types";
import { naiveBaselinePredict } from "./baseline";
import { groundedBaselinePredict } from "./baseline-grounded";

interface MetricAccumulator {
  correct: number;
  total: number;
  unknownGold: number;
  unknownPredicted: number;
  unknownTruePositive: number;
  faithfulnessTotal: number;
  faithfulnessOk: number;
  substringFaithTotal: number;
  substringFaithOk: number;
  entailmentFaithTotal: number;
  entailmentFaithOk: number;
  exclusionGold: number;
  exclusionDetected: number;
}

function initAcc(): MetricAccumulator {
  return {
    correct: 0,
    total: 0,
    unknownGold: 0,
    unknownPredicted: 0,
    unknownTruePositive: 0,
    faithfulnessTotal: 0,
    faithfulnessOk: 0,
    substringFaithTotal: 0,
    substringFaithOk: 0,
    entailmentFaithTotal: 0,
    entailmentFaithOk: 0,
    exclusionGold: 0,
    exclusionDetected: 0,
  };
}

function goldFaithful(
  pair: LabeledPair,
  citedLineId: string | null
): boolean | undefined {
  if (pair.gold_state === "UNKNOWN") return undefined;
  if (!citedLineId) return false;
  return pair.gold_supporting_line_ids.includes(citedLineId);
}

function updateAcc(
  acc: MetricAccumulator,
  gold: CriterionState,
  predicted: CriterionState,
  faithful?: boolean,
  substringFaithful?: boolean,
  entailmentFaithful?: boolean,
  isExclusion?: boolean
) {
  acc.total++;
  if (gold === predicted) acc.correct++;
  if (gold === "UNKNOWN") acc.unknownGold++;
  if (predicted === "UNKNOWN") acc.unknownPredicted++;
  if (gold === "UNKNOWN" && predicted === "UNKNOWN") acc.unknownTruePositive++;
  if (predicted !== "UNKNOWN") {
    acc.faithfulnessTotal++;
    if (faithful !== false) acc.faithfulnessOk++;
    if (substringFaithful !== undefined) {
      acc.substringFaithTotal++;
      if (substringFaithful !== false) acc.substringFaithOk++;
    }
    if (entailmentFaithful !== undefined) {
      acc.entailmentFaithTotal++;
      if (entailmentFaithful !== false) acc.entailmentFaithOk++;
    }
  }
  if (isExclusion && gold === "MET") {
    acc.exclusionGold++;
    if (predicted === "MET") acc.exclusionDetected++;
  }
}

function finalize(acc: MetricAccumulator) {
  return {
    accuracy: acc.total ? acc.correct / acc.total : 0,
    unknown_recall: acc.unknownGold
      ? acc.unknownTruePositive / acc.unknownGold
      : 0,
    unknown_precision: acc.unknownPredicted
      ? acc.unknownTruePositive / acc.unknownPredicted
      : 0,
    faithfulness_rate: acc.entailmentFaithTotal
      ? acc.entailmentFaithOk / acc.entailmentFaithTotal
      : acc.faithfulnessTotal
        ? acc.faithfulnessOk / acc.faithfulnessTotal
        : 1,
    substring_faithfulness_rate: acc.substringFaithTotal
      ? acc.substringFaithOk / acc.substringFaithTotal
      : 1,
    entailment_faithfulness_rate: acc.entailmentFaithTotal
      ? acc.entailmentFaithOk / acc.entailmentFaithTotal
      : 1,
    exclusion_detection_rate: acc.exclusionGold
      ? acc.exclusionDetected / acc.exclusionGold
      : 1,
  };
}

async function lumenPredict(pair: LabeledPair): Promise<{
  state: CriterionState;
  citedLineId: string | null;
  substringOk: boolean;
  entailmentOk: boolean | undefined;
}> {
  const chart = await loadChart(pair.patient_id);
  const profile = await extractProfile(chart, { useGoldenProfile: true });
  const trial = loadPinnedTrial(pair.trial_id);
  const criteria = await decomposeCriteria(trial, trial.relevant_cohort);
  const criterion = criteria.find((c) => c.criterion_id === pair.criterion_id);

  if (!criterion) {
    return {
      state: "UNKNOWN",
      citedLineId: null,
      substringOk: true,
      entailmentOk: undefined,
    };
  }

  const results = await evaluateCriteria([criterion], chart, profile);
  const r = results[0];
  return {
    state: r.state,
    citedLineId: r.evidence_line_id,
    substringOk: r.faithfulness.substring_ok,
    entailmentOk: r.faithfulness.entailment_ok,
  };
}

async function main() {
  const pairsPath = join(process.cwd(), "data/eval/labeled-pairs.json");
  const pairs = JSON.parse(readFileSync(pairsPath, "utf-8")) as LabeledPair[];

  const lumenAcc = initAcc();
  const naiveAcc = initAcc();
  const groundedAcc = initAcc();

  for (const pair of pairs) {
    const { state, citedLineId, substringOk, entailmentOk } =
      await lumenPredict(pair);
    const goldFaith = goldFaithful(pair, citedLineId);
    const entailmentFaith =
      state !== "UNKNOWN" &&
      goldFaith !== undefined &&
      goldFaith &&
      entailmentOk !== false;

    updateAcc(
      lumenAcc,
      pair.gold_state,
      state,
      goldFaith,
      substringOk,
      entailmentFaith,
      pair.type === "EXCLUSION"
    );

    const naive = naiveBaselinePredict(pair);
    updateAcc(
      naiveAcc,
      pair.gold_state,
      naive,
      true,
      undefined,
      undefined,
      pair.type === "EXCLUSION"
    );

    const grounded = groundedBaselinePredict(pair);
    updateAcc(
      groundedAcc,
      pair.gold_state,
      grounded,
      false,
      undefined,
      undefined,
      pair.type === "EXCLUSION"
    );
  }

  const results: EvalMetrics = {
    lumen: finalize(lumenAcc),
    baseline_naive: finalize(naiveAcc),
    baseline_grounded: finalize(groundedAcc),
    total_pairs: pairs.length,
    generated_at: new Date().toISOString(),
  };

  const outPath = join(process.cwd(), "data/eval/results.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log("\n=== Lumen vs Baselines ===\n");
  console.log(
    "Metric".padEnd(32),
    "Lumen".padStart(8),
    "Naive".padStart(8),
    "Grounded".padStart(8)
  );
  console.log("-".repeat(58));
  for (const key of [
    "accuracy",
    "unknown_recall",
    "unknown_precision",
    "faithfulness_rate",
    "entailment_faithfulness_rate",
    "substring_faithfulness_rate",
    "exclusion_detection_rate",
  ] as const) {
    console.log(
      key.padEnd(32),
      (results.lumen[key] ?? 0).toFixed(2).padStart(8),
      (results.baseline_naive[key] ?? 0).toFixed(2).padStart(8),
      (results.baseline_grounded?.[key] ?? 0).toFixed(2).padStart(8)
    );
  }

  const groundedRecall = results.baseline_grounded?.unknown_recall ?? 0;
  const lumenRecall = results.lumen.unknown_recall;
  if (lumenRecall < groundedRecall) {
    console.warn(
      `\nWARNING: Lumen UNKNOWN-recall (${lumenRecall.toFixed(2)}) trails grounded baseline (${groundedRecall.toFixed(2)})`
    );
    process.exitCode = 1;
  }

  console.log(`\nWrote ${outPath} (${pairs.length} pairs)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
