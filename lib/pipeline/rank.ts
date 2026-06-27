import { costWeight } from "../actions/actionMap";
import type { CriterionResult, TrialVerdict, Verdict } from "../types";

/** Reachability rank in [0, 1] — higher means closer to enrollable. */
export function computeReachabilityRank(
  verdict: Verdict,
  results: CriterionResult[],
  _actionableGap: TrialVerdict["actionable_gap"]
): number {
  if (verdict === "EXCLUDED") return 0;
  if (verdict === "ELIGIBLE") return 1;

  const unknowns = results.filter((r) => r.state === "UNKNOWN");
  let penalty = 0;
  for (const u of unknowns) {
    const tier = u.resolving_action?.cost_tier ?? "MODERATE";
    penalty += costWeight(tier);
  }

  return Math.max(0.4, 1 - penalty);
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

export const REACHABILITY_FORMULA =
  "ELIGIBLE → 1.0 · EXCLUDED → 0.0 · CONDITIONAL → 1 − Σ(cost_weight of blocking UNKNOWN), floor 0.4 (CHEAP 0.05, MODERATE 0.15, EXPENSIVE 0.30)";
