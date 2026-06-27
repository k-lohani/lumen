import type { Verdict } from "@/lib/types";

const VERDICT_STYLES: Record<
  Verdict,
  { label: string; classes: string }
> = {
  ELIGIBLE: {
    label: "Eligible",
    classes:
      "border-sage/25 bg-sage-light text-sage-dark",
  },
  CONDITIONALLY_ELIGIBLE: {
    label: "Conditional",
    classes:
      "border-honey/30 bg-honey-light text-honey-dark",
  },
  EXCLUDED: {
    label: "Excluded",
    classes:
      "border-crimson/25 bg-crimson-light text-crimson",
  },
};

interface VerdictBadgeProps {
  verdict: Verdict;
  className?: string;
}

export function VerdictBadge({ verdict, className = "" }: VerdictBadgeProps) {
  const style = VERDICT_STYLES[verdict];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${style.classes} ${className}`}
    >
      {style.label}
    </span>
  );
}
