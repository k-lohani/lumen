import type { TrialVerdict } from "@/lib/types";
import { citationVerified } from "@/lib/pipeline/aggregate";

interface TrialConfidenceSummaryProps {
  trial: TrialVerdict;
}

export function TrialConfidenceSummary({ trial }: TrialConfidenceSummaryProps) {
  const total = trial.criteria.length;
  const verified = trial.criteria.filter(
    (c) => c.state !== "UNKNOWN" && citationVerified(c)
  ).length;
  const needsTest = trial.criteria.filter((c) => c.state === "UNKNOWN").length;
  const withEntailment = trial.criteria.filter(
    (c) => c.faithfulness.entailment_ok === true
  ).length;

  if (total === 0) return null;

  const parts: string[] = [`${verified} of ${total} criteria verified`];
  if (needsTest > 0) {
    parts.push(`${needsTest} need${needsTest === 1 ? "s" : ""} test`);
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-ink-muted">{parts.join(" · ")}</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded border border-sage/25 bg-sage-light/50 px-2 py-0.5 text-[10px] font-semibold text-sage-dark">
          Faithfulness gate
        </span>
        {withEntailment > 0 && (
          <span className="rounded border border-copper/25 bg-copper/10 px-2 py-0.5 text-[10px] font-semibold text-copper">
            Entailment verified ({withEntailment})
          </span>
        )}
        <span className="rounded border border-rule bg-parchment-deep px-2 py-0.5 text-[10px] font-medium text-ink-faint">
          {verified} citations verified
        </span>
      </div>
    </div>
  );
}
