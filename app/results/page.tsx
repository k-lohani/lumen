"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DecisionSupportBanner } from "@/components/DecisionSupportBanner";
import { NaiveCompareToggle, type NaiveResult } from "@/components/NaiveComparePanel";
import { PatientStoryHeader } from "@/components/PatientStoryHeader";
import { TrialList } from "@/components/TrialList";
import { VerdictSummaryBar } from "@/components/VerdictSummaryBar";
import {
  applyResolutionFlip,
  type ResolutionAfterEchoFixture,
} from "@/lib/demo/applyResolution";
import { buildCoordinatorSummary } from "@/lib/export/coordinatorSummary";
import { useDemoParam, withDemoParam } from "@/lib/hooks/useDemoParam";
import type { GeoFilter, TrialVerdict } from "@/lib/types";

interface MatchResponse {
  patientSlug: string;
  mrn: string;
  display_name: string;
  matched_at: string;
  patient_story?: string;
  discovered_trials?: number;
  search_summary?: {
    condition: string;
    terms: string[];
    status: string[];
    phases: string[];
    geo?: GeoFilter;
  };
  verdicts: TrialVerdict[];
  demo?: boolean;
  error?: string;
}

interface NaiveBaselineResponse {
  highlight_criterion_id: string;
  results: NaiveResult[];
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
  const demo = useDemoParam();
  const patientSlug =
    searchParams.get("patientSlug") ??
    searchParams.get("chartId") ??
    "hero";
  const source = searchParams.get("source");

  const [data, setData] = useState<MatchResponse | null>(null);
  const [verdicts, setVerdicts] = useState<TrialVerdict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [naiveCompare, setNaiveCompare] = useState(false);
  const [naiveBaseline, setNaiveBaseline] =
    useState<NaiveBaselineResponse | null>(null);
  const [resolutionFixture, setResolutionFixture] =
    useState<ResolutionAfterEchoFixture | null>(null);
  const [resolvedTrials, setResolvedTrials] = useState<Set<string>>(
    new Set()
  );
  const [simulatingTrialId, setSimulatingTrialId] = useState<string | null>(
    null
  );
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchMatch() {
      setLoading(true);
      setError(null);
      setResolvedTrials(new Set());

      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientSlug: source === "session" ? "paste-demo" : patientSlug,
            demo,
          }),
        });

        const json = (await res.json()) as MatchResponse;

        if (!res.ok) {
          throw new Error(json.error ?? "Analysis could not be completed.");
        }

        if (!cancelled) {
          setData(json);
          setVerdicts(json.verdicts);
        }
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
  }, [patientSlug, demo, source]);

  useEffect(() => {
    if (!demo) return;
    let cancelled = false;

    async function loadDemoExtras() {
      const [naiveRes, resolutionRes] = await Promise.all([
        fetch("/api/demo/naive-baseline"),
        fetch("/api/demo/resolution-after-echo"),
      ]);
      if (cancelled) return;
      if (naiveRes.ok) {
        setNaiveBaseline((await naiveRes.json()) as NaiveBaselineResponse);
      }
      if (resolutionRes.ok) {
        setResolutionFixture(
          (await resolutionRes.json()) as ResolutionAfterEchoFixture
        );
      }
    }

    loadDemoExtras();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const handleSimulateResolution = useCallback(
    (trialId: string) => {
      if (!resolutionFixture || trialId !== resolutionFixture.trial_id) return;
      setSimulatingTrialId(trialId);
      window.setTimeout(() => {
        setVerdicts((prev) => {
          const updated = prev.map((v) => {
            if (v.trial_id !== trialId) return v;
            return applyResolutionFlip(v, resolutionFixture);
          });
          return updated.sort((a, b) => {
            if (a.verdict === "ELIGIBLE" && b.verdict !== "ELIGIBLE")
              return -1;
            if (b.verdict === "ELIGIBLE" && a.verdict !== "ELIGIBLE")
              return 1;
            return b.reachability_rank - a.reachability_rank;
          });
        });
        setResolvedTrials((s) => new Set(s).add(trialId));
        setSimulatingTrialId(null);
      }, 400);
    },
    [resolutionFixture]
  );

  async function copySummary() {
    if (!data) return;
    const md = buildCoordinatorSummary({
      displayName: data.display_name,
      mrn: data.mrn,
      matchedAt: data.matched_at,
      searchSummary: data.search_summary,
      verdicts,
    });
    await navigator.clipboard.writeText(md);
    setCopyStatus("Copied!");
    window.setTimeout(() => setCopyStatus(null), 2000);
  }

  const eligibleCount =
    verdicts.filter((v) => v.verdict === "ELIGIBLE").length;
  const conditionalCount =
    verdicts.filter((v) => v.verdict === "CONDITIONALLY_ELIGIBLE").length;
  const excludedCount =
    verdicts.filter((v) => v.verdict === "EXCLUDED").length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 print:py-6">
      <header className="animate-fade-up mb-10 print:mb-6">
        <Link
          href={withDemoParam("/", demo)}
          className="inline-flex items-center gap-1 text-sm font-medium text-copper transition-colors hover:text-copper-light lumen-focus rounded-sm no-print"
        >
          ← Back to pre-screen
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-copper">
              Pre-screen results
            </p>
            <h1
              className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
              style={{ fontFamily: "var(--font-fraunces)" }}
            >
              Trial eligibility review
            </h1>
            {data && (
              <p className="mt-2 text-sm text-ink-muted">
                <span className="font-semibold text-ink">
                  {data.display_name}
                </span>
                {" · "}
                {data.mrn}
                {" · "}
                Completed {formatDateTime(data.matched_at)}
              </p>
            )}
            {data?.discovered_trials != null && (
              <p className="mt-1 text-sm text-ink-faint">
                {data.discovered_trials} trial
                {data.discovered_trials === 1 ? "" : "s"} evaluated
                {data.search_summary && (
                  <>
                    {" "}
                    · {data.search_summary.condition}
                    {data.search_summary.geo && (
                      <>
                        {" "}
                        · within {data.search_summary.geo.radiusMi} mi of{" "}
                        {data.search_summary.geo.label}
                      </>
                    )}
                  </>
                )}
              </p>
            )}
            {demo && (
              <span className="mt-2 inline-block rounded-md border border-copper/30 bg-copper/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-copper no-print">
                Demo mode — offline fixtures
              </span>
            )}
          </div>
          {data && !loading && (
            <div className="flex flex-wrap gap-2 no-print">
              <button
                type="button"
                onClick={copySummary}
                className="lumen-focus rounded-lg border border-rule bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-copper/40"
              >
                {copyStatus ?? "Copy pre-screen summary"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="lumen-focus rounded-lg border border-rule bg-paper px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Print
              </button>
            </div>
          )}
        </div>

        {data?.patient_story && !loading && (
          <div className="mt-6">
            <PatientStoryHeader story={data.patient_story} />
          </div>
        )}

        {data && !loading && (
          <div className="mt-4">
            <VerdictSummaryBar
              displayName={data.display_name}
              verdicts={verdicts}
            />
          </div>
        )}

        {data && !loading && (
          <div className="animate-fade-up stagger-1 mt-6 flex flex-wrap gap-3">
            {eligibleCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-sage/20 bg-sage-light px-4 py-2">
                <span className="text-2xl font-semibold text-sage-dark">
                  {eligibleCount}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-sage">
                  Hand off to PI
                </span>
              </div>
            )}
            {conditionalCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-honey/20 bg-honey-light px-4 py-2">
                <span className="text-2xl font-semibold text-honey-dark">
                  {conditionalCount}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-honey">
                  Order missing test
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

        {data && !loading && demo && (
          <div className="mt-6 no-print">
            <NaiveCompareToggle
              enabled={naiveCompare}
              onToggle={() => setNaiveCompare((v) => !v)}
            />
          </div>
        )}
      </header>

      {loading && (
        <div className="loading-shimmer animate-fade-in rounded-2xl border border-rule px-6 py-16 text-center">
          <p className="text-sm font-medium text-ink-muted">
            Loading pre-screen results…
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
          <TrialList
            verdicts={verdicts}
            naiveCompare={naiveCompare}
            naiveResults={naiveBaseline?.results}
            highlightCriterionId={naiveBaseline?.highlight_criterion_id}
            onSimulateResolution={
              demo && resolutionFixture ? handleSimulateResolution : undefined
            }
            resolvedTrials={resolvedTrials}
            simulatingTrialId={simulatingTrialId}
          />
          <DecisionSupportBanner />
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
