import { costWeight } from "../actions/actionMap";
import type { CriterionResult, TrialVerdict, Verdict } from "../types";

function costTierNumber(tier: "CHEAP" | "MODERATE" | "EXPENSIVE"): number {
  switch (tier) {
    case "CHEAP":
      return 1;
    case "MODERATE":
      return 2;
    case "EXPENSIVE":
      return 3;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Reachability rank in [0, 1] — higher means closer to enrollable. */
export function computeReachabilityRank(
  verdict: Verdict,
  results: CriterionResult[],
  actionableGap: TrialVerdict["actionable_gap"]
): number {
  if (verdict === "EXCLUDED") return 0;
  if (verdict === "ELIGIBLE") return 1;

  const inclusions = results.filter((r) => r.criterion.type === "INCLUSION");
  const metInclusions = inclusions.filter((r) => r.state === "MET").length;
  const base =
    inclusions.length > 0 ? metInclusions / inclusions.length : 0;

  const unknowns = results.filter((r) => r.state === "UNKNOWN");
  let weightedPenalty = 0;
  for (const u of unknowns) {
    const tier = u.resolving_action?.cost_tier ?? "MODERATE";
    weightedPenalty += costWeight(tier);
  }

  const formulaRank =
    0.9 -
    0.1 * (actionableGap ? costTierNumber(actionableGap.cost_tier) - 1 : 0) -
    0.02 * Math.max(0, unknowns.length - 1);

  const blended = Math.max(base - weightedPenalty, formulaRank);
  return clamp(blended, 0.4, 1);
}

export function rankVerdicts(verdicts: TrialVerdict[]): TrialVerdict[] {
  return [...verdicts].sort((a, b) => {
    if (b.reachability_rank !== a.reachability_rank) {
      return b.reachability_rank - a.reachability_rank;
    }
    const unknownA = a.criteria.filter((c) => c.state === "UNKNOWN").length;
    const unknownB = b.criteria.filter((c) => c.state === "UNKNOWN").length;
    return unknownA - unknownB;
  });
}
