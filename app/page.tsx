"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PatientPackage } from "@/lib/types";

interface DiscoveryPreview {
  trials: { nct_id: string; title: string; phase?: string; status: string }[];
  discovery: {
    search_summary: {
      condition: string;
      terms: string[];
      status: string[];
      phases: string[];
    };
    discovered_at?: string;
  } | null;
}

type PatientListItem = {
  slug: string;
  mrn: string;
  display_name: string;
  primary_diagnosis: string;
  chart_synced_at: string;
  source_system: string;
  line_count: number;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isPatientPackage(value: unknown): value is PatientPackage {
  if (!value || typeof value !== "object") return false;
  const pkg = value as PatientPackage;
  return typeof pkg.slug === "string" && Array.isArray(pkg.lines);
}

export default function HomePage() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [patientSlug, setPatientSlug] = useState("hero");
  const [patientPackage, setPatientPackage] = useState<PatientPackage | null>(
    null
  );
  const [discoveryPreview, setDiscoveryPreview] =
    useState<DiscoveryPreview | null>(null);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingPackage, setLoadingPackage] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selected = patients.find((p) => p.slug === patientSlug);

  useEffect(() => {
    let cancelled = false;

    async function loadPatients() {
      setLoadingPatients(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/patients");
        const data = (await res.json()) as {
          patients?: PatientListItem[];
          error?: string;
        };
        if (!res.ok || !Array.isArray(data.patients) || !data.patients.length) {
          throw new Error(data.error ?? "Unable to load patients.");
        }
        const loadedPatients = data.patients;
        if (cancelled) return;
        setPatients(loadedPatients);
        setPatientSlug((current) =>
          loadedPatients.some((p) => p.slug === current)
            ? current
            : loadedPatients[0].slug
        );
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load patients."
          );
          setPatients([]);
        }
      } finally {
        if (!cancelled) setLoadingPatients(false);
      }
    }

    loadPatients();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!patientSlug) return;
    let cancelled = false;

    async function loadPackage() {
      setLoadingPackage(true);
      try {
        const [pkgRes, trialsRes] = await Promise.all([
          fetch(`/api/patients/${patientSlug}`),
          fetch(`/api/trials?patientSlug=${patientSlug}`),
        ]);

        const pkgData: unknown = await pkgRes.json();
        if (!pkgRes.ok || !isPatientPackage(pkgData)) {
          const message =
            pkgData &&
            typeof pkgData === "object" &&
            "error" in pkgData &&
            typeof (pkgData as { error: string }).error === "string"
              ? (pkgData as { error: string }).error
              : "Unable to load patient package.";
          throw new Error(message);
        }
        if (!cancelled) setPatientPackage(pkgData);

        if (trialsRes.ok) {
          const trialsData = (await trialsRes.json()) as DiscoveryPreview;
          if (!cancelled) setDiscoveryPreview(trialsData);
        } else if (!cancelled) {
          setDiscoveryPreview(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPatientPackage(null);
          setLoadError(
            err instanceof Error ? err.message : "Unable to load patient package."
          );
        }
      } finally {
        if (!cancelled) setLoadingPackage(false);
      }
    }

    loadPackage();
    return () => {
      cancelled = true;
    };
  }, [patientSlug]);

  function runMatch() {
    setLoading(true);
    router.push(`/results?patientSlug=${patientSlug}`);
  }

  const summaryLines = patientPackage?.lines.length
    ? [
        patientPackage.lines
          .find((l) => l.section === "Demographics")
          ?.text.split(".")[0],
        patientPackage.lines.find((l) => l.line_id === "L0002")?.text.split(
          "."
        )[0],
        patientPackage.lines
          .find((l) => l.line_id === "L0003")
          ?.text.split(";")[0],
        patientPackage.lines.find((l) => l.line_id === "L0004")?.text,
      ].filter(Boolean)
    : [];

  const showPatientPanel = selected && patientPackage && !loadingPackage;

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(184,115,51,0.25) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="animate-fade-up mb-12 max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-copper">
            Clinical trial eligibility
          </p>
          <h1
            className="mt-3 text-4xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-5xl"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Evaluate recruiting trials against the patient record
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            Criterion-by-criterion analysis with line-level evidence cited from
            clinical documentation.
          </p>
        </header>

        {loadError && (
          <div className="mb-6 rounded-2xl border border-crimson/30 bg-crimson-light px-5 py-4 text-sm text-crimson">
            {loadError}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          <section className="animate-fade-up stagger-2 rounded-2xl border border-rule bg-paper shadow-[var(--shadow-soft)]">
            <div className="border-b border-rule px-6 py-5 sm:px-8">
              <label
                htmlFor="patient-select"
                className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-faint"
              >
                Patient package
              </label>
              <select
                id="patient-select"
                value={patientSlug}
                onChange={(e) => setPatientSlug(e.target.value)}
                disabled={loadingPatients || patients.length === 0}
                className="lumen-select lumen-focus mt-2 w-full rounded-lg border border-rule-strong bg-parchment px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-copper/30 focus:border-copper disabled:opacity-50"
              >
                {patients.length === 0 ? (
                  <option value="">Loading patients…</option>
                ) : (
                  patients.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.display_name} · {p.mrn}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="px-6 py-6 sm:px-8">
              {(loadingPatients || loadingPackage) && !showPatientPanel && (
                <p className="text-sm text-ink-muted">Loading patient package…</p>
              )}

              {showPatientPanel && (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-faint">
                        {selected.mrn}
                      </p>
                      <h2
                        className="mt-1.5 text-2xl font-semibold text-ink"
                        style={{ fontFamily: "var(--font-fraunces)" }}
                      >
                        {selected.display_name}
                      </h2>
                      <p className="mt-1 text-sm text-ink-muted">
                        {selected.primary_diagnosis}
                      </p>
                      <p className="mt-2 text-xs text-ink-faint">
                        Chart last updated{" "}
                        {formatDate(selected.chart_synced_at)} ·{" "}
                        {selected.source_system} · {patientPackage.line_count}{" "}
                        chart lines
                      </p>
                    </div>
                  </div>

                  {summaryLines.length > 0 && (
                    <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                      {summaryLines.join(" · ")}
                    </p>
                  )}

                  <div className="mt-6 rounded-xl border border-rule bg-parchment-deep/60 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-faint">
                      Clinical record excerpt
                    </p>
                    <ul className="mt-3 space-y-2.5">
                      {patientPackage.lines.slice(0, 8).map((line) => (
                        <li
                          key={line.line_id}
                          className="group flex flex-col gap-0.5 sm:flex-row sm:gap-3"
                        >
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className="font-mono text-[11px] font-medium text-copper/70"
                              style={{
                                fontFamily: "var(--font-ibm-plex-mono)",
                              }}
                            >
                              {line.line_id}
                            </span>
                            <span className="text-[10px] text-ink-faint">
                              {line.document_type} ·{" "}
                              {formatDate(line.recorded_at)}
                            </span>
                          </div>
                          <span className="text-sm leading-relaxed text-ink-muted">
                            {line.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8">
                    <button
                      type="button"
                      onClick={runMatch}
                      disabled={loading}
                      className="lumen-focus rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-paper shadow-sm transition-all hover:bg-sage-dark disabled:opacity-50"
                    >
                      {loading ? "Running…" : "Run eligibility match"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          <aside className="animate-fade-up stagger-3 space-y-4">
            <div className="rounded-2xl border border-rule bg-paper p-6 shadow-[var(--shadow-soft)]">
              <h3
                className="text-lg font-semibold text-ink"
                style={{ fontFamily: "var(--font-fraunces)" }}
              >
                How it works
              </h3>
              <ol className="mt-4 space-y-4">
                {[
                  "Extract structured profile from clinical documentation",
                  "Search ClinicalTrials.gov for recruiting trials",
                  "Route to the correct trial cohort",
                  "Evaluate each criterion with chart citations",
                ].map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm text-ink-muted">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-copper/10 text-xs font-bold text-copper">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-rule bg-paper p-6 shadow-[var(--shadow-soft)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-faint">
                Trial discovery
              </p>
              {discoveryPreview?.trials?.length ? (
                <>
                  <p className="mt-2 text-xs text-ink-muted">
                    Last search:{" "}
                    {discoveryPreview.discovery?.search_summary?.condition ??
                      "ClinicalTrials.gov"}
                    {(discoveryPreview.discovery?.search_summary?.terms
                      ?.length ?? 0) > 0
                      ? ` · ${discoveryPreview.discovery!.search_summary!.terms.join(", ")}`
                      : ""}
                  </p>
                  <ul className="mt-4 space-y-4">
                    {discoveryPreview.trials.slice(0, 5).map((t) => (
                      <li key={t.nct_id} className="text-sm">
                        <p className="font-mono text-[11px] text-copper">
                          {t.nct_id}
                        </p>
                        <p className="mt-0.5 font-medium leading-snug text-ink">
                          {t.title.length > 72
                            ? `${t.title.slice(0, 72)}…`
                            : t.title}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  Trials will be discovered from ClinicalTrials.gov at match time
                  based on this patient&apos;s diagnosis and biomarkers.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
