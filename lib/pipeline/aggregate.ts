import { costWeight, resolveAction } from "../actions/actionMap";
import type {
  ActionableGap,
  CriterionResult,
  CriterionState,
  Verdict,
} from "../types";
import { citationVerified } from "./verifyCitation";

function cheapestUnknown(
  results: CriterionResult[]
): ActionableGap | null {
  const unknowns = results.filter((r) => r.state === "UNKNOWN");
  if (unknowns.length === 0) return null;

  let best: ActionableGap | null = null;
  let bestWeight = Infinity;

  for (const u of unknowns) {
    const action =
      u.resolving_action ??
      resolveAction(u.criterion.text, u.criterion.category);
    const weight = costWeight(action.cost_tier);
    if (weight < bestWeight) {
      bestWeight = weight;
      best = action;
    }
  }

  return best;
}

export function aggregateVerdict(results: CriterionResult[]): {
  verdict: Verdict;
  actionable_gap: ActionableGap | null;
} {
  const firingExclusion = results.some(
    (r) =>
      r.criterion.type === "EXCLUSION" &&
      r.state === "MET" &&
      citationVerified(r)
  );

  if (firingExclusion) {
    return { verdict: "EXCLUDED", actionable_gap: null };
  }

  const inclusions = results.filter((r) => r.criterion.type === "INCLUSION");
  const failedInclusion = inclusions.some(
    (r) => r.state === "NOT_MET" && citationVerified(r)
  );

  if (failedInclusion) {
    return { verdict: "EXCLUDED", actionable_gap: null };
  }

  const allInclusionsMet = inclusions.every((r) => r.state === "MET");
  const hasUnknown = results.some((r) => r.state === "UNKNOWN");

  // ELIGIBLE bar: all inclusions MET with verified citations, zero UNKNOWN
  if (allInclusionsMet && !hasUnknown) {
    const allVerified = inclusions.every(
      (r) => r.state === "MET" && citationVerified(r)
    );
    if (allVerified) {
      return { verdict: "ELIGIBLE", actionable_gap: null };
    }
  }

  if (allInclusionsMet && hasUnknown) {
    return {
      verdict: "CONDITIONALLY_ELIGIBLE",
      actionable_gap: cheapestUnknown(results),
    };
  }

  if (hasUnknown && !failedInclusion) {
    return {
      verdict: "CONDITIONALLY_ELIGIBLE",
      actionable_gap: cheapestUnknown(results),
    };
  }

  return { verdict: "EXCLUDED", actionable_gap: null };
}

export function attachResolvingActions(
  results: CriterionResult[]
): CriterionResult[] {
  return results.map((r) => {
    if (r.state !== "UNKNOWN") return r;
    const action = resolveAction(r.criterion.text, r.criterion.category);
    return { ...r, resolving_action: action };
  });
}

export function countByState(
  results: CriterionResult[],
  state: CriterionState
): number {
  return results.filter((r) => r.state === state).length;
}

export { citationVerified };
