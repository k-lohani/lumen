"use client";

import { useId, useState } from "react";

interface ReachabilityBadgeProps {
  rank: number;
}

const FORMULA = `Reachability rank (0–1):

• ELIGIBLE: rank ≈ met_inclusions / total_inclusions
• CONDITIONAL: base − weighted unknowns
  − CHEAP gap: −0.05
  − MODERATE gap: −0.15
  − EXPENSIVE gap: −0.30
• EXCLUDED: rank = 0

Higher rank = closer to enrollment.`;

export function ReachabilityBadge({ rank }: ReachabilityBadgeProps) {
  const pct = Math.round(rank * 100);
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="lumen-focus inline-flex cursor-help items-center gap-1 rounded-md border border-rule bg-parchment-deep px-2 py-0.5 text-[11px] font-medium text-ink-muted transition-colors hover:border-copper/30 hover:text-ink"
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span className="tabular-nums">Reach {pct}%</span>
        <svg
          className="h-3 w-3 text-ink-faint"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-xl border border-rule bg-ink px-4 py-3 text-left text-[11px] leading-relaxed font-normal text-parchment shadow-[var(--shadow-lift)]"
        >
          <span className="whitespace-pre-line">{FORMULA}</span>
        </span>
      )}
    </span>
  );
}
