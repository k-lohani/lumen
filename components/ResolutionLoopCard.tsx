import type { ActionableGap } from "@/lib/types";

interface ResolutionLoopCardProps {
  gap: ActionableGap;
  onSimulate: () => void;
  simulating?: boolean;
  resolved?: boolean;
}

export function ResolutionLoopCard({
  gap,
  onSimulate,
  simulating,
  resolved,
}: ResolutionLoopCardProps) {
  if (resolved) return null;

  return (
    <div className="mt-5 rounded-xl border-2 border-honey/40 bg-honey-light/40 p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-honey-dark">
        What stands between this patient and enrollment
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink">
        <span className="font-semibold">{gap.missing_item}</span> —{" "}
        {gap.action}
        {gap.threshold && (
          <span className="text-ink-muted"> ({gap.threshold})</span>
        )}
        . Every other criterion is met.
      </p>
      <button
        type="button"
        onClick={onSimulate}
        disabled={simulating}
        className="lumen-focus mt-4 rounded-lg bg-honey-dark px-4 py-2 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {simulating ? "Updating…" : "Simulate result added"}
      </button>
    </div>
  );
}
