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

  if (total === 0) return null;

  const parts: string[] = [`${verified} of ${total} criteria verified`];
  if (needsTest > 0) {
    parts.push(`${needsTest} need${needsTest === 1 ? "s" : ""} test`);
  }

  return (
    <p className="mt-2 text-xs font-medium text-ink-muted">
      {parts.join(" · ")}
    </p>
  );
}
