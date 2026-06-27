import type { TrialVerdict, Verdict } from "@/lib/types";
import { TrialCard } from "./TrialCard";
import type { NaiveResult } from "./NaiveComparePanel";

interface TrialListProps {
  verdicts: TrialVerdict[];
  naiveCompare?: boolean;
  naiveResults?: NaiveResult[];
  highlightCriterionId?: string;
  onSimulateResolution?: (trialId: string) => void;
  resolvedTrials?: Set<string>;
  simulatingTrialId?: string | null;
  demoExpanded?: boolean;
}

const SECTIONS: {
  verdict: Verdict;
  title: string;
  description: string;
  accentClass: string;
  numberClass: string;
}[] = [
  {
    verdict: "ELIGIBLE",
    title: "Eligible now",
    description: "Ready to hand off to PI — all criteria met.",
    accentClass: "section-eligible",
    numberClass: "text-sage-dark",
  },
  {
    verdict: "CONDITIONALLY_ELIGIBLE",
    title: "One step away",
    description: "Order missing test or document — then eligible.",
    accentClass: "section-conditional",
    numberClass: "text-honey-dark",
  },
  {
    verdict: "EXCLUDED",
    title: "Not eligible",
    description: "Hard exclusion or unmet required inclusion.",
    accentClass: "section-excluded",
    numberClass: "text-crimson",
  },
];

function sortByRank(trials: TrialVerdict[]): TrialVerdict[] {
  return [...trials].sort((a, b) => b.reachability_rank - a.reachability_rank);
}

export function TrialList({
  verdicts,
  naiveCompare,
  naiveResults,
  highlightCriterionId,
  onSimulateResolution,
  resolvedTrials,
  simulatingTrialId,
  demoExpanded,
}: TrialListProps) {
  const grouped = SECTIONS.map((section) => ({
    ...section,
    trials: sortByRank(
      verdicts.filter((v) => v.verdict === section.verdict)
    ),
  })).filter((section) => section.trials.length > 0);

  if (grouped.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-rule-strong px-6 py-12 text-center text-sm text-ink-faint">
        No trials matched this patient&apos;s profile on ClinicalTrials.gov.
      </p>
    );
  }

  return (
    <div className="space-y-12">
      {grouped.map((section, sectionIdx) => (
        <section
          key={section.verdict}
          className={`animate-fade-up pl-5 ${section.accentClass}`}
          style={{ animationDelay: `${sectionIdx * 0.1}s` }}
        >
          <div className="mb-5">
            <div className="flex items-baseline gap-3">
              <h2
                className="text-xl font-semibold text-ink"
                style={{ fontFamily: "var(--font-fraunces)" }}
              >
                {section.title}
              </h2>
              <span
                className={`text-sm font-semibold tabular-nums ${section.numberClass}`}
              >
                {section.trials.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">{section.description}</p>
          </div>
          <div className="space-y-4">
            {section.trials.map((trial, i) => (
              <div
                key={trial.trial_id}
                className="animate-fade-up"
                style={{ animationDelay: `${sectionIdx * 0.1 + i * 0.06}s` }}
              >
                <TrialCard
                  trial={trial}
                  naiveCompare={naiveCompare}
                  naiveResults={naiveResults}
                  highlightCriterionId={highlightCriterionId}
                  onSimulateResolution={onSimulateResolution}
                  resolutionResolved={resolvedTrials?.has(trial.trial_id)}
                  simulatingResolution={simulatingTrialId === trial.trial_id}
                  defaultExpanded={
                    demoExpanded ||
                    (trial.trial_id === "NCT07070232" &&
                      section.verdict === "CONDITIONALLY_ELIGIBLE")
                  }
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
