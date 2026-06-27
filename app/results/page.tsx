"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgentTrail } from "@/components/AgentTrail";
import { DecisionSupportBanner } from "@/components/DecisionSupportBanner";
import { PatientStoryHeader } from "@/components/PatientStoryHeader";
import { TrialList } from "@/components/TrialList";
import { VerdictSummaryBar } from "@/components/VerdictSummaryBar";
import { buildCoordinatorSummary, COMPLIANCE_LINE } from "@/lib/export/coordinatorSummary";
import { loadSessionChart, loadSessionProfile } from "@/lib/intake/sessionChart";
import { consumeSse } from "@/lib/sse";
import type { GeoFilter, PipelineProgressEvent, TrialVerdict } from "@/lib/types";

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

const MATCH_FETCH_TIMEOUT_MS = 600_000;

function parseGeoParam(geoParam: string | null): GeoFilter | undefined {
  if (!geoParam) return undefined;
  try {
    return JSON.parse(geoParam) as GeoFilter;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(geoParam)) as GeoFilter;
    } catch {
      return undefined;
    }
  }
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const patientSlug =
    searchParams.get("patientSlug") ??
    searchParams.get("chartId") ??
    "hero";
  const source = searchParams.get("source");
  const geoParam = searchParams.get("geo");
  const geoFilter = useMemo(() => parseGeoParam(geoParam), [geoParam]);
  const fetchGenRef = useRef(0);

  const [data, setData] = useState<MatchResponse | null>(null);
  const [verdicts, setVerdicts] = useState<TrialVerdict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trail, setTrail] = useState<PipelineProgressEvent[]>([]);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useLayoutEffect(() => {
    const fetchId = ++fetchGenRef.current;
    const controller = new AbortController();
    let timeoutId = window.setTimeout(
      () => controller.abort(),
      MATCH_FETCH_TIMEOUT_MS
    );

    async function fetchMatch() {
      setLoading(true);
      setError(null);
      setTrail([]);

      const resetTimeout = () => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(
          () => controller.abort(),
          MATCH_FETCH_TIMEOUT_MS
        );
      };

      try {
        const sessionChart =
          source === "session" ? loadSessionChart() : null;
        const sessionProfile =
          source === "session" ? loadSessionProfile() : null;

        const res = await fetch("/api/match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          signal: controller.signal,
          body: JSON.stringify(
            sessionChart
              ? { chart: sessionChart, geoFilter, profile: sessionProfile ?? undefined }
              : { patientSlug, geoFilter }
          ),
        });

        const contentType = res.headers.get("content-type") ?? "";

        if (contentType.includes("text/event-stream")) {
          await consumeSse(res, (event, payload) => {
            resetTimeout();
            if (event === "progress") {
              setTrail((prev) => [
                ...prev,
                payload as PipelineProgressEvent,
              ]);
            } else if (event === "done") {
              const json = payload as MatchResponse;
              if (fetchId !== fetchGenRef.current) return;
              setData(json);
              setVerdicts(json.verdicts);
            } else if (event === "error") {
              const err = payload as { message?: string };
              throw new Error(err.message ?? "Analysis could not be completed.");
            }
          });
        } else {
          const json = (await res.json()) as MatchResponse;
          if (!res.ok) {
            throw new Error(json.error ?? "Analysis could not be completed.");
          }
          if (fetchId !== fetchGenRef.current) return;
          setData(json);
          setVerdicts(json.verdicts);
        }
      } catch (err) {
        if (fetchId !== fetchGenRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(
            "Analysis timed out. Pre-screening can take up to three minutes — please try again."
          );
          return;
        }
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        window.clearTimeout(timeoutId);
        if (fetchId === fetchGenRef.current) {
          setLoading(false);
        }
      }
    }

    void fetchMatch();
    return () => {
      window.clearTimeout(timeoutId);
      fetchGenRef.current += 1;
      controller.abort();
    };
  }, [patientSlug, source, geoFilter]);

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
      {data && (
        <div className="print-header hidden print:block text-sm text-ink">
          <p className="font-semibold">
            {data.display_name} · {data.mrn}
          </p>
          <p className="text-ink-muted">
            Pre-screen · {formatDateTime(data.matched_at)}
          </p>
          <p className="mt-1 text-xs text-ink-faint">{COMPLIANCE_LINE}</p>
        </div>
      )}
      <header className="animate-fade-up mb-10 print:mb-6">
        <Link
          href="/"
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
                Print / Save as PDF
              </button>
              <p className="w-full text-xs text-ink-faint">
                Opens your browser print dialog — choose &ldquo;Save as PDF&rdquo;
                to export.
              </p>
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

      </header>

      {loading && (
        <div className="animate-fade-in">
          <AgentTrail events={trail} />
        </div>
      )}

      {error && (
        <div className="animate-fade-in rounded-2xl border border-crimson/30 bg-crimson-light px-5 py-4 text-sm text-crimson">
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="animate-fade-up stagger-2">
          <TrialList verdicts={verdicts} />
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
