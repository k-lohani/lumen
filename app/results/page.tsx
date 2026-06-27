"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { TrialList } from "@/components/TrialList";
import type { TrialVerdict } from "@/lib/types";

interface MatchResponse {
  patientSlug: string;
  mrn: string;
  display_name: string;
  matched_at: string;
  discovered_trials?: number;
  search_summary?: {
    condition: string;
    terms: string[];
    status: string[];
    phases: string[];
  };
  verdicts: TrialVerdict[];
  error?: string;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const patientSlug = searchParams.get("patientSlug") ?? searchParams.get("chartId") ?? "hero";

  const [data, setData] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchMatch() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientSlug }),
        });

        const json = (await res.json()) as MatchResponse;

        if (!res.ok) {
          throw new Error(json.error ?? "Analysis could not be completed.");
        }

        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMatch();
    return () => {
      cancelled = true;
    };
  }, [patientSlug]);

  const eligibleCount =
    data?.verdicts.filter((v) => v.verdict === "ELIGIBLE").length ?? 0;
  const conditionalCount =
    data?.verdicts.filter((v) => v.verdict === "CONDITIONALLY_ELIGIBLE").length ??
    0;
  const excludedCount =
    data?.verdicts.filter((v) => v.verdict === "EXCLUDED").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <header className="animate-fade-up mb-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-copper transition-colors hover:text-copper-light lumen-focus rounded-sm"
        >
          ← Back to patients
        </Link>
        <div className="mt-4">
          <h1
            className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Eligibility results
          </h1>
          {data && (
            <p className="mt-2 text-sm text-ink-muted">
              <span className="font-semibold text-ink">{data.display_name}</span>
              {" · "}
              {data.mrn}
              {" · "}
              Analysis completed {formatDateTime(data.matched_at)}
            </p>
          )}
          {data?.discovered_trials != null && (
            <p className="mt-1 text-sm text-ink-faint">
              Evaluated {data.discovered_trials} recruiting trial
              {data.discovered_trials === 1 ? "" : "s"} from ClinicalTrials.gov
              {data.search_summary && (
                <>
                  {" "}
                  · Search: {data.search_summary.condition}
                  {data.search_summary.terms.length
                    ? ` · ${data.search_summary.terms.join(" · ")}`
                    : ""}
                </>
              )}
            </p>
          )}
        </div>

        {data && !loading && (
          <div className="animate-fade-up stagger-1 mt-6 flex flex-wrap gap-3">
            {eligibleCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-sage/20 bg-sage-light px-4 py-2">
                <span className="text-2xl font-semibold text-sage-dark">
                  {eligibleCount}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-sage">
                  Eligible
                </span>
              </div>
            )}
            {conditionalCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-honey/20 bg-honey-light px-4 py-2">
                <span className="text-2xl font-semibold text-honey-dark">
                  {conditionalCount}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-honey">
                  One step away
                </span>
              </div>
            )}
            {excludedCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-crimson/20 bg-crimson-light px-4 py-2">
                <span className="text-2xl font-semibold text-crimson">
                  {excludedCount}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-crimson/80">
                  Excluded
                </span>
              </div>
            )}
          </div>
        )}
      </header>

      {loading && (
        <div className="loading-shimmer animate-fade-in rounded-2xl border border-rule px-6 py-16 text-center">
          <p className="text-sm font-medium text-ink-muted">
            Analyzing eligibility criteria against patient record…
          </p>
        </div>
      )}

      {error && (
        <div className="animate-fade-in rounded-2xl border border-crimson/30 bg-crimson-light px-5 py-4 text-sm text-crimson">
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="animate-fade-up stagger-2">
          <TrialList verdicts={data.verdicts} />
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-5 py-12 text-sm text-ink-faint">
          Loading…
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
