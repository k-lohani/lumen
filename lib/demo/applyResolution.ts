import type { CriterionResult, TrialVerdict } from "@/lib/types";

export interface ResolutionAfterEchoFixture {
  trial_id: string;
  verdict: TrialVerdict;
  injected_line: { id: string; section: string; text: string };
}

export function applyResolutionFlip(
  current: TrialVerdict,
  after: ResolutionAfterEchoFixture
): TrialVerdict {
  if (current.trial_id !== after.trial_id) return current;
  return {
    ...after.verdict,
    reachability_rank: Math.max(current.reachability_rank, 0.95),
  };
}

export function findHighlightCriterion(
  trial: TrialVerdict
): CriterionResult | undefined {
  return trial.criteria.find(
    (c) =>
      c.state === "UNKNOWN" &&
      /lvef|echo/i.test(c.criterion.text)
  );
}
