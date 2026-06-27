import type { ActionableGap } from "@/lib/types";

interface ActionableGapCalloutProps {
  gap: ActionableGap;
}

export function ActionableGapCallout({ gap }: ActionableGapCalloutProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-honey/35 bg-gradient-to-r from-honey-light to-paper px-5 py-4">
      <div
        className="absolute left-0 top-0 h-full w-1 bg-honey"
        aria-hidden
      />
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-honey-dark">
        One step away
      </p>
      <p className="mt-1.5 text-sm font-semibold text-ink">
        Missing: {gap.missing_item}
      </p>
      <p className="mt-1.5 text-sm text-ink-muted">
        <span className="font-medium text-ink">Recommended action:</span>{" "}
        {gap.action}
      </p>
      {gap.threshold && (
        <p className="mt-1.5 text-sm text-honey-dark">
          <span className="font-medium">If resolved:</span> {gap.threshold}
        </p>
      )}
      {gap.cost_tier && (
        <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-honey/80">
          Cost tier: {gap.cost_tier}
        </p>
      )}
    </div>
  );
}
