"use client";

import type { PipelineProgressEvent } from "@/lib/types";

interface AgentTrailProps {
  events: PipelineProgressEvent[];
}

function formatEvent(event: PipelineProgressEvent): string | null {
  switch (event.type) {
    case "stage_start":
      return event.message;
    case "stage_end":
      if (event.stage === "profile" && event.meta) {
        const biomarkers = event.meta.biomarkers as string[] | undefined;
        const primary = event.meta.primary as string | undefined;
        const parts = [primary, biomarkers?.length ? biomarkers.join(", ") : null]
          .filter(Boolean)
          .join(" · ");
        return parts ? `${event.message} — ${parts}` : event.message;
      }
      if (event.stage === "discovery" && event.meta) {
        const condition = event.meta.condition as string | undefined;
        const terms = event.meta.terms as string[] | undefined;
        const ncts = event.meta.nct_ids as string[] | undefined;
        const detail = [
          condition,
          terms?.length ? `terms: ${terms.join(", ")}` : null,
          ncts?.length ? `${ncts.length} NCT IDs` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return detail ? `${event.message} — ${detail}` : event.message;
      }
      if (event.stage === "trial" && event.meta) {
        const { eligible, conditional, excluded } = event.meta as {
          eligible?: number;
          conditional?: number;
          excluded?: number;
        };
        return `${event.message} — ${eligible ?? 0} eligible, ${conditional ?? 0} conditional, ${excluded ?? 0} excluded`;
      }
      return event.message;
    case "trial_start":
      return `Trial ${event.index}/${event.total}: ${event.nct_id} — ${event.title.length > 60 ? `${event.title.slice(0, 60)}…` : event.title}`;
    case "trial_step":
      if (event.step === "cohort" && event.meta?.cohort) {
        return `${event.nct_id} · Cohort ${event.meta.cohort}${event.meta.label ? `: ${String(event.meta.label).slice(0, 50)}` : ""}`;
      }
      if (event.step === "decompose") {
        const count = event.meta?.criteria_count;
        return count != null
          ? `${event.nct_id} · Split protocol into ${count} criteria`
          : `${event.nct_id} · Parsing eligibility criteria…`;
      }
      if (event.step === "evaluate") {
        const batch = event.meta?.batch as number | undefined;
        const total = event.meta?.batch_total as number | undefined;
        const size = event.meta?.batch_size as number | undefined;
        if (batch && total) {
          return `${event.nct_id} · Evaluating criteria (batch ${batch}/${total}, ${size ?? "?"} criteria)`;
        }
        return `${event.nct_id} · Evaluating criteria with Claude…`;
      }
      if (event.step === "entailment") {
        return `${event.nct_id} · Verifying chart citations…`;
      }
      return null;
    case "trial_done":
      return `${event.nct_id} · ${event.verdict.replace(/_/g, " ")} (${event.index}/${event.total})`;
    default:
      return null;
  }
}

function eventKey(event: PipelineProgressEvent, index: number): string {
  if (event.type === "trial_step") {
    const batch = event.meta?.batch ?? "";
    return `${index}-${event.type}-${event.nct_id}-${event.step}-${batch}`;
  }
  if ("nct_id" in event && event.nct_id) {
    return `${index}-${event.type}-${event.nct_id}`;
  }
  if ("stage" in event) {
    return `${index}-${event.type}-${event.stage}`;
  }
  return `${index}-${event.type}`;
}

export function AgentTrail({ events }: AgentTrailProps) {
  const lines = events
    .map((event, index) => ({ text: formatEvent(event), key: eventKey(event, index) }))
    .filter((line): line is { text: string; key: string } => Boolean(line.text));

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-rule bg-paper px-6 py-10">
        <p className="text-sm font-medium text-ink-muted">
          Starting pre-screen pipeline…
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rule bg-paper px-6 py-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-copper">
        Agent trail
      </p>
      <p className="mt-1 text-xs text-ink-faint">
        Live progress from profile extraction through trial evaluation
      </p>
      <ol className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {lines.map((line, i) => {
          const isLatest = i === lines.length - 1;
          return (
            <li
              key={line.key}
              className={`flex gap-3 text-sm leading-snug ${
                isLatest ? "text-ink font-medium" : "text-ink-muted"
              }`}
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  isLatest
                    ? "animate-pulse bg-copper"
                    : "bg-copper/30"
                }`}
                aria-hidden
              />
              <span>{line.text}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
