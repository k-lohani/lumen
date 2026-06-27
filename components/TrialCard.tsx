"use client";

import { useState } from "react";
import type { TrialVerdict } from "@/lib/types";
import { humanizeTrialStatus } from "@/lib/clinicaltrials/client";
import { ActionableGapCallout } from "./ActionableGapCallout";
import { CriterionRow } from "./CriterionRow";
import {
  NaiveCompareRow,
  type NaiveResult,
} from "./NaiveComparePanel";
import { ReachabilityBadge } from "./ReachabilityBadge";
import { ResolutionLoopCard } from "./ResolutionLoopCard";
import { TrialConfidenceSummary } from "./TrialConfidenceSummary";
import { StalenessBanner } from "./StalenessBanner";
import { VerdictBadge } from "./VerdictBadge";

interface TrialCardProps {
  trial: TrialVerdict;
  naiveCompare?: boolean;
  naiveResults?: NaiveResult[];
  highlightCriterionId?: string;
  onSimulateResolution?: (trialId: string) => void;
  resolutionResolved?: boolean;
  simulatingResolution?: boolean;
  defaultExpanded?: boolean;
}

export function TrialCard({
  trial,
  naiveCompare,
  naiveResults,
  highlightCriterionId,
  onSimulateResolution,
  resolutionResolved,
  simulatingResolution,
  defaultExpanded = false,
}: TrialCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const nctUrl = `https://clinicaltrials.gov/study/${trial.trial_id}`;

  const showResolution =
    trial.verdict === "CONDITIONALLY_ELIGIBLE" &&
    trial.actionable_gap &&
    onSimulateResolution;

  return (
    <article
      className={`group overflow-hidden rounded-2xl border bg-paper shadow-[var(--shadow-soft)] transition-all hover:shadow-[var(--shadow-lift)] ${
        resolutionResolved && trial.verdict === "ELIGIBLE"
          ? "border-sage/50 ring-2 ring-sage/20"
          : "border-rule"
      }`}
    >
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={trial.verdict} />
              <ReachabilityBadge rank={trial.reachability_rank} />
              {trial.recruiting_sites_nearby != null &&
                trial.recruiting_sites_nearby > 0 && (
                  <span className="rounded-md border border-copper/25 bg-copper/10 px-2.5 py-0.5 text-[11px] font-semibold text-copper">
                    {trial.recruiting_sites_nearby} recruiting site
                    {trial.recruiting_sites_nearby === 1 ? "" : "s"} nearby
                  </span>
                )}
              <span className="rounded-md border border-sage/20 bg-sage-light px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sage-dark">
                {trial.cohort_label}
              </span>
              <span className="rounded-md border border-rule bg-parchment-deep px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">
                {humanizeTrialStatus(trial.trial_status)}
              </span>
            </div>
            <h3
              className="mt-3 text-lg font-semibold leading-snug text-ink"
              style={{ fontFamily: "var(--font-fraunces)" }}
            >
              {trial.trial_title}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <a
                href={nctUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs font-medium text-copper transition-colors hover:text-copper-light lumen-focus rounded-sm"
                style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
              >
                {trial.trial_id} ↗
              </a>
              {trial.phase && (
                <>
                  <span className="text-ink-faint" aria-hidden>
                    ·
                  </span>
                  <span>{trial.phase}</span>
                </>
              )}
            </div>
            {trial.nearest_sites && trial.nearest_sites.length > 0 && (
              <p className="mt-2 text-xs text-ink-muted">
                Nearest:{" "}
                {trial.nearest_sites
                  .slice(0, 2)
                  .map((s) =>
                    [s.facility, s.city, s.state].filter(Boolean).join(", ")
                  )
                  .join(" · ")}
              </p>
            )}
            <p className="mt-2 text-[11px] text-ink-faint">
              Registry updated {trial.registry_synced_at} · ClinicalTrials.gov
            </p>
            <TrialConfidenceSummary trial={trial} />
            <StalenessBanner trial={trial} />
          </div>
        </div>

        {showResolution && (
          <ResolutionLoopCard
            gap={trial.actionable_gap!}
            onSimulate={() => onSimulateResolution!(trial.trial_id)}
            simulating={simulatingResolution}
            resolved={resolutionResolved}
          />
        )}

        {trial.verdict === "CONDITIONALLY_ELIGIBLE" &&
          trial.actionable_gap &&
          !showResolution && (
            <div className="mt-5">
              <ActionableGapCallout gap={trial.actionable_gap} />
            </div>
          )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="lumen-focus mt-5 flex items-center gap-2 rounded-md text-sm font-semibold text-copper transition-colors hover:text-copper-light"
          aria-expanded={expanded}
        >
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded border border-rule-strong bg-parchment-deep text-xs transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ↓
          </span>
          {expanded ? "Hide" : "Show"} {trial.criteria.length} criteria
        </button>
      </div>

      {expanded && (
        <div className="border-t border-rule bg-parchment/50 px-6">
          {trial.criteria.map((result) => {
            const naive = naiveResults?.find(
              (n) => n.criterion_id === result.criterion.criterion_id
            );
            const highlighted =
              result.criterion.criterion_id === highlightCriterionId;

            return (
              <div key={result.criterion.criterion_id}>
                <CriterionRow result={result} highlighted={highlighted} />
                {naiveCompare && naive && (
                  <NaiveCompareRow
                    naive={naive}
                    lumen={result}
                    highlighted={highlighted}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
