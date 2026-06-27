"use client";

import { useState } from "react";
import type { TrialVerdict } from "@/lib/types";
import { humanizeTrialStatus } from "@/lib/clinicaltrials/client";
import { ActionableGapCallout } from "./ActionableGapCallout";
import { CriterionRow } from "./CriterionRow";
import { ReachabilityBadge } from "./ReachabilityBadge";
import { VerdictBadge } from "./VerdictBadge";

interface TrialCardProps {
  trial: TrialVerdict;
}

export function TrialCard({ trial }: TrialCardProps) {
  const [expanded, setExpanded] = useState(false);
  const nctUrl = `https://clinicaltrials.gov/study/${trial.trial_id}`;

  return (
    <article className="group overflow-hidden rounded-2xl border border-rule bg-paper shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={trial.verdict} />
              <ReachabilityBadge rank={trial.reachability_rank} />
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
            <p className="mt-2 text-[11px] text-ink-faint">
              Registry updated {trial.registry_synced_at} · ClinicalTrials.gov
            </p>
          </div>
        </div>

        {trial.verdict === "CONDITIONALLY_ELIGIBLE" && trial.actionable_gap && (
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
          {trial.criteria.map((result) => (
            <CriterionRow key={result.criterion.criterion_id} result={result} />
          ))}
        </div>
      )}
    </article>
  );
}
