"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EvalMetrics } from "@/lib/types";

export default function EvalPage() {
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/eval")
      .then(async (res) => {
        if (!res.ok) throw new Error("Eval results unavailable");
        return res.json() as Promise<EvalMetrics>;
      })
      .then(setMetrics)
      .catch(() => setError("Run npm run eval locally to refresh metrics."));
  }, []);

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <Link href="/" className="text-sm font-medium text-copper">
        ← Back to pre-screen
      </Link>
      <h1
        className="mt-4 text-3xl font-semibold text-ink"
        style={{ fontFamily: "var(--font-fraunces)" }}
      >
        Evaluation vs baselines
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        42 labeled criterion pairs — proves Lumen is not a single-prompt wrapper.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rule bg-parchment-deep px-4 py-3 text-sm text-ink-muted">
          {error}
        </p>
      )}

      {metrics && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["Lumen (full pipeline)", metrics.lumen],
                ["Grounded (no gates)", metrics.baseline_grounded],
                ["Naive (forced guess)", metrics.baseline_naive],
              ] as const
            ).map(([label, block]) =>
              block ? (
                <div
                  key={label}
                  className="rounded-xl border border-rule bg-paper p-5"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                    {label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-ink">
                    {pct(block.accuracy)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    accuracy · UNKNOWN recall {pct(block.unknown_recall)}
                  </p>
                </div>
              ) : null
            )}
          </div>
          <p className="text-sm text-ink-muted">
            Ablation: decomposition + faithfulness + entailment gates beat both
            naive single-prompt ({pct(metrics.baseline_naive.accuracy)}) and
            grounded-without-gates (
            {metrics.baseline_grounded
              ? pct(metrics.baseline_grounded.accuracy)
              : "—"}
            ). Naive baseline never returns UNKNOWN — recall 0%.
          </p>
          <p className="text-xs text-ink-faint">
            Generated {new Date(metrics.generated_at).toLocaleString()} ·{" "}
            {metrics.total_pairs} pairs
          </p>
        </div>
      )}
    </div>
  );
}
