import type { CriterionResult } from "@/lib/types";

const STATE_STYLES = {
  MET: {
    label: "Met",
    dot: "bg-sage",
    text: "text-sage-dark",
    border: "border-sage/30",
  },
  NOT_MET: {
    label: "Not met",
    dot: "bg-crimson",
    text: "text-crimson",
    border: "border-crimson/30",
  },
  UNKNOWN: {
    label: "Unknown",
    dot: "bg-honey",
    text: "text-honey-dark",
    border: "border-honey/30",
  },
} as const;

interface CriterionRowProps {
  result: CriterionResult;
}

export function CriterionRow({ result }: CriterionRowProps) {
  const { criterion, state, evidence_span, rationale, resolving_action, faithfulness, evidence_line_id } =
    result;
  const style = STATE_STYLES[state];
  const unverified =
    !faithfulness.substring_ok ||
    (faithfulness.entailment_ok !== undefined && !faithfulness.entailment_ok);

  return (
    <div className="border-b border-rule py-5 last:border-b-0">
      <div className="flex items-start gap-4">
        <span
          className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[11px] font-bold uppercase tracking-[0.12em] ${style.text}`}
            >
              {style.label}
            </span>
            <span className="rounded border border-rule bg-parchment-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              {criterion.type === "INCLUSION" ? "Inclusion" : "Exclusion"}
            </span>
            {evidence_line_id && (
              <span
                className="font-mono text-[10px] text-copper/80"
                style={{ fontFamily: "var(--font-ibm-plex-mono)" }}
              >
                {evidence_line_id}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-ink">
            {criterion.text}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {rationale}
          </p>

          {evidence_span && (
            <blockquote
              className={`mt-4 rounded-r-lg border-l-[3px] bg-paper px-4 py-3 text-sm italic leading-relaxed text-ink-muted ${style.border}`}
            >
              &ldquo;{evidence_span}&rdquo;
            </blockquote>
          )}

          {state === "UNKNOWN" && resolving_action && (
            <p className="mt-3 rounded-lg border border-honey/25 bg-honey-light/60 px-3 py-2 text-sm text-honey-dark">
              <span className="font-semibold">Next step:</span>{" "}
              {resolving_action.action}
              {resolving_action.threshold && (
                <span className="text-honey-dark/80">
                  {" "}
                  — {resolving_action.threshold}
                </span>
              )}
            </p>
          )}

          {unverified && (
            <p className="mt-2 text-xs font-medium text-honey-dark">
              Citation could not be verified against source record.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
