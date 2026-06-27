"use client";

import type { CriterionResult } from "@/lib/types";
import type { NaiveResult } from "@/lib/demo/loadFixtures";

export type { NaiveResult };

interface NaiveComparePanelProps {
  enabled: boolean;
  onToggle: () => void;
  naiveResults: NaiveResult[];
  highlightCriterionId: string;
  lumenResult: CriterionResult;
}

export function NaiveCompareToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-rule bg-paper px-4 py-3 text-sm">
      <input
        type="checkbox"
        checked={enabled}
        onChange={onToggle}
        className="h-4 w-4 accent-copper"
      />
      <span>
        <span className="font-semibold text-ink">Compare to naive AI</span>
        <span className="mt-0.5 block text-xs text-ink-muted">
          Single-prompt guess (no citations, no UNKNOWN) vs. Lumen&apos;s
          grounded verdict
        </span>
      </span>
    </label>
  );
}

export function NaiveCompareRow({
  naive,
  lumen,
  highlighted,
}: {
  naive: NaiveResult;
  lumen: CriterionResult;
  highlighted: boolean;
}) {
  const naiveWrong =
    highlighted &&
    lumen.state === "UNKNOWN" &&
    naive.state === "MET" &&
    lumen.criterion.type === "EXCLUSION";

  return (
    <div
      className={`mt-3 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 ${
        naiveWrong
          ? "border-crimson/40 bg-crimson-light/30"
          : "border-rule bg-parchment-deep/40"
      }`}
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
          Naive AI (forced guess)
        </p>
        <p
          className={`mt-1 text-sm font-semibold ${
            naive.state === "MET" ? "text-sage-dark" : "text-crimson"
          }`}
        >
          {naive.state === "MET" ? "Met" : "Not met"}
        </p>
        <p className="mt-1 text-xs text-ink-muted">{naive.rationale}</p>
        {naiveWrong && (
          <p className="mt-2 text-xs font-semibold text-crimson">
            Fabricated — chart has no echo/LVEF on file.
          </p>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-copper">
          Lumen (grounded)
        </p>
        <p className="mt-1 text-sm font-semibold text-honey-dark">
          {lumen.state === "UNKNOWN"
            ? "Unknown — needs verification"
            : lumen.state === "MET"
              ? "Met"
              : "Not met"}
        </p>
        {lumen.evidence_span && (
          <p className="mt-1 text-xs italic text-ink-muted">
            &ldquo;{lumen.evidence_span}&rdquo;
          </p>
        )}
        {!lumen.evidence_span && lumen.state === "UNKNOWN" && (
          <p className="mt-1 text-xs text-ink-muted">{lumen.rationale}</p>
        )}
      </div>
    </div>
  );
}
