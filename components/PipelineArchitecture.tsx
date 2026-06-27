"use client";

export function PipelineArchitecture() {
  const stages = [
    { label: "Chart", sub: "De-identified lines" },
    { label: "Profile", sub: "Structured extract" },
    { label: "Discovery", sub: "CT.gov v2" },
    { label: "Decompose", sub: "Atomic criteria" },
    { label: "Evaluate", sub: "Per-criterion LLM" },
    { label: "Verify", sub: "Faithfulness + entailment" },
    { label: "Verdict", sub: "Rank + gaps" },
  ];

  return (
    <div className="rounded-2xl border border-rule bg-paper p-6 shadow-[var(--shadow-soft)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-copper">
        Citation-verified pipeline
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        Multi-stage neurosymbolic pipeline — LLM reads language, deterministic
        gates verify every citation.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="rounded-lg border border-rule bg-parchment-deep px-3 py-2 text-center">
              <p className="text-xs font-semibold text-ink">{s.label}</p>
              <p className="text-[10px] text-ink-faint">{s.sub}</p>
            </div>
            {i < stages.length - 1 && (
              <span className="text-ink-faint" aria-hidden>
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
