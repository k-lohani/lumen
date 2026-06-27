"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { NYC_GEO_DEFAULT } from "@/lib/demo/constants";
import { useDemoParam, withDemoParam } from "@/lib/hooks/useDemoParam";
import {
  DEMO_PASTE_SAMPLE,
  parsePastedChart,
} from "@/lib/intake/parsePastedChart";
import { saveSessionChart } from "@/lib/intake/sessionChart";
import type { GeoFilter, PatientPackage, PatientProfile } from "@/lib/types";

interface DiscoveryPreview {
  trials: {
    nct_id: string;
    title: string;
    phase?: string;
    status: string;
    recruiting_sites_nearby?: number;
  }[];
  discovery: {
    search_summary: {
      condition: string;
      terms: string[];
      status: string[];
      phases: string[];
      geo?: GeoFilter;
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

type Tab = "demo" | "paste";

const RADIUS_OPTIONS = [25, 50, 100];

function isPatientPackage(value: unknown): value is PatientPackage {
  if (!value || typeof value !== "object") return false;
  const pkg = value as PatientPackage;
  return typeof pkg.slug === "string" && Array.isArray(pkg.lines);
}

export default function HomePageClient() {
  const router = useRouter();
  const demo = useDemoParam();
  const [tab, setTab] = useState<Tab>("demo");
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
  const [geo, setGeo] = useState<GeoFilter>(NYC_GEO_DEFAULT);
  const [pasteText, setPasteText] = useState("");
  const [parsedLines, setParsedLines] = useState<
    { id: string; section: string; text: string }[] | null
  >(null);
  const [extractedProfile, setExtractedProfile] =
    useState<PatientProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

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
    if (!patientSlug || tab !== "demo") return;
    let cancelled = false;

    async function loadPackage() {
      setLoadingPackage(true);
      try {
        const demoQ = demo ? "&demo=1" : "";
        const [pkgRes, trialsRes] = await Promise.all([
          fetch(`/api/patients/${patientSlug}`),
          fetch(`/api/trials?patientSlug=${patientSlug}${demoQ}`),
        ]);

        const pkgData: unknown = await pkgRes.json();
        if (!pkgRes.ok || !isPatientPackage(pkgData)) {
          throw new Error("Unable to load patient package.");
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
  }, [patientSlug, demo, tab]);

  function runMatchDemo() {
    setLoading(true);
    router.push(
      withDemoParam(`/results?patientSlug=${patientSlug}`, demo)
    );
  }

  function parsePaste() {
    const chart = parsePastedChart(pasteText || DEMO_PASTE_SAMPLE, {
      displayName: "Pasted patient note",
    });
    setParsedLines(chart.lines);
    setExtractedProfile(null);
  }

  async function extractProfileFromPaste() {
    const chart = parsePastedChart(pasteText || DEMO_PASTE_SAMPLE, {
      displayName: "Pasted patient note",
    });
    if (!parsedLines?.length) setParsedLines(chart.lines);
    setProfileLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart, demo }),
      });
      const data = (await res.json()) as {
        profile?: PatientProfile;
        error?: string;
      };
      if (!res.ok || !data.profile) {
        throw new Error(data.error ?? "Profile extraction failed.");
      }
      setExtractedProfile(data.profile);
      saveSessionChart(chart);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Profile extraction failed."
      );
    } finally {
      setProfileLoading(false);
    }
  }

  function runPasteMatch() {
    setLoading(true);
    router.push(
      withDemoParam("/results?source=session&patientSlug=paste-demo", demo)
    );
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
        <header className="animate-fade-up mb-10 max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-copper">
            Clinical trial pre-screening copilot
          </p>
          <h1
            className="mt-3 text-4xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-5xl"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Hours of manual screening, one reviewable pre-screen
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            Research coordinators spend significant time reading eligibility
            PDFs against chart notes — yet most screened patients still fail.
            Lumen delivers cited per-criterion verdicts, actionable gaps, and
            geo-aware trial discovery for the coordinator to review and hand off
            to the PI.
          </p>
          {demo && (
            <span className="mt-3 inline-block rounded-md border border-copper/30 bg-copper/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-copper">
              Demo mode — offline fixtures
            </span>
          )}
        </header>

        {loadError && (
          <div className="mb-6 rounded-2xl border border-crimson/30 bg-crimson-light px-5 py-4 text-sm text-crimson">
            {loadError}
          </div>
        )}

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("demo")}
            className={`lumen-focus rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === "demo"
                ? "bg-ink text-paper"
                : "border border-rule text-ink-muted hover:text-ink"
            }`}
          >
            Demo patients
          </button>
          <button
            type="button"
            onClick={() => setTab("paste")}
            className={`lumen-focus rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === "paste"
                ? "bg-ink text-paper"
                : "border border-rule text-ink-muted hover:text-ink"
            }`}
          >
            Paste chart
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          <section className="animate-fade-up stagger-2 rounded-2xl border border-rule bg-paper shadow-[var(--shadow-soft)]">
            {tab === "demo" ? (
              <>
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
                          {p.slug === "hero"
                            ? `${p.display_name} · Recommended demo`
                            : `${p.display_name} · ${p.mrn}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="border-b border-rule px-6 py-4 sm:px-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-faint">
                    Patient site (geo filter)
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {geo.label} · default for demo
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {RADIUS_OPTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() =>
                          setGeo({ ...NYC_GEO_DEFAULT, radiusMi: r })
                        }
                        className={`lumen-focus rounded-md px-3 py-1.5 text-xs font-semibold ${
                          geo.radiusMi === r
                            ? "bg-copper text-paper"
                            : "border border-rule text-ink-muted"
                        }`}
                      >
                        {r} mi
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-6 py-6 sm:px-8">
                  {(loadingPatients || loadingPackage) && !showPatientPanel && (
                    <p className="text-sm text-ink-muted">
                      Loading patient package…
                    </p>
                  )}

                  {showPatientPanel && (
                    <>
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
                              className="flex flex-col gap-0.5 sm:flex-row sm:gap-3"
                            >
                              <span
                                className="font-mono text-[11px] font-medium text-copper/70"
                                style={{
                                  fontFamily: "var(--font-ibm-plex-mono)",
                                }}
                              >
                                {line.line_id}
                              </span>
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
                          onClick={runMatchDemo}
                          disabled={loading}
                          className="lumen-focus rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-paper shadow-sm transition-all hover:bg-sage-dark disabled:opacity-50"
                        >
                          {loading ? "Running…" : "Run pre-screen"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="px-6 py-6 sm:px-8">
                <p className="text-sm text-ink-muted">
                  Paste a de-identified oncology note. In demo mode, pre-cached
                  results mirror the Margaret Chen case.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value);
                    setParsedLines(null);
                    setExtractedProfile(null);
                  }}
                  placeholder={DEMO_PASTE_SAMPLE}
                  rows={8}
                  className="lumen-focus mt-4 w-full rounded-lg border border-rule-strong bg-parchment px-4 py-3 text-sm leading-relaxed text-ink"
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={parsePaste}
                    className="lumen-focus rounded-lg border border-rule px-4 py-2 text-sm font-semibold text-ink"
                  >
                    Parse chart
                  </button>
                  <button
                    type="button"
                    onClick={extractProfileFromPaste}
                    disabled={profileLoading}
                    className="lumen-focus rounded-lg border border-rule px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    {profileLoading ? "Extracting…" : "Extract profile"}
                  </button>
                </div>

                {parsedLines && (
                  <div className="mt-6 rounded-xl border border-rule bg-parchment-deep/60 p-4">
                    <p className="text-xs font-semibold uppercase text-ink-faint">
                      {parsedLines.length} chart lines
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                      {parsedLines.slice(0, 5).map((l) => (
                        <li key={l.id}>
                          <span className="font-mono text-copper/70">{l.id}</span>{" "}
                          {l.text.slice(0, 80)}…
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {extractedProfile && (
                  <div className="mt-6 rounded-xl border border-sage/30 bg-sage-light/30 p-4">
                    <p className="text-xs font-semibold uppercase text-sage-dark">
                      Profile preview
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-ink">
                      <li>
                        {extractedProfile.diagnosis.primary}{" "}
                        {extractedProfile.diagnosis.stage &&
                          `· Stage ${extractedProfile.diagnosis.stage}`}
                      </li>
                      {extractedProfile.biomarkers.map((b) => (
                        <li key={b.name}>
                          <GlossaryTerm term="EGFR">{b.name}</GlossaryTerm> —{" "}
                          {b.status}
                        </li>
                      ))}
                      {extractedProfile.prior_therapies.map((t) => (
                        <li key={t.name}>
                          Prior{" "}
                          <GlossaryTerm term="osimertinib">{t.name}</GlossaryTerm>
                        </li>
                      ))}
                      {extractedProfile.performance_status && (
                        <li>
                          <GlossaryTerm term="ECOG">ECOG</GlossaryTerm>{" "}
                          {extractedProfile.performance_status.value}
                        </li>
                      )}
                    </ul>
                    <button
                      type="button"
                      onClick={runPasteMatch}
                      disabled={loading}
                      className="lumen-focus mt-4 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-50"
                    >
                      Run pre-screen
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="animate-fade-up stagger-3 space-y-4">
            <div className="rounded-2xl border border-rule bg-paper p-6 shadow-[var(--shadow-soft)]">
              <h3
                className="text-lg font-semibold text-ink"
                style={{ fontFamily: "var(--font-fraunces)" }}
              >
                Coordinator workflow
              </h3>
              <ol className="mt-4 space-y-4">
                {[
                  "Extract structured profile from chart",
                  "Discover trials near patient site",
                  "Evaluate each criterion with citations",
                  "Hand PI-ready pre-screen summary",
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
                    {discoveryPreview.discovery?.search_summary?.condition ??
                      "ClinicalTrials.gov"}
                    {discoveryPreview.discovery?.search_summary?.geo && (
                      <>
                        {" "}
                        · within{" "}
                        {
                          discoveryPreview.discovery.search_summary.geo
                            .radiusMi
                        }{" "}
                        mi of{" "}
                        {
                          discoveryPreview.discovery.search_summary.geo.label
                        }
                      </>
                    )}
                  </p>
                  <ul className="mt-4 space-y-4">
                    {discoveryPreview.trials.slice(0, 5).map((t) => (
                      <li key={t.nct_id} className="text-sm">
                        <p className="font-mono text-[11px] text-copper">
                          {t.nct_id}
                          {t.recruiting_sites_nearby != null &&
                            t.recruiting_sites_nearby > 0 && (
                              <span className="ml-2 text-ink-faint">
                                · {t.recruiting_sites_nearby} sites nearby
                              </span>
                            )}
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
                  Trials discovered based on diagnosis, biomarkers, and patient
                  location.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
