"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GlossaryTerm } from "@/components/GlossaryTerm";
import { PipelineArchitecture } from "@/components/PipelineArchitecture";
import { NYC_GEO_DEFAULT } from "@/lib/constants/geo";
import type {
  HomeDiscoveryPreview,
  HomePatientListItem,
  InitialHomeData,
} from "@/lib/server/initialHomeData";
import {
  PASTE_SAMPLE,
  parsePastedChart,
} from "@/lib/intake/parsePastedChart";
import { saveSessionChart } from "@/lib/intake/sessionChart";
import type { GeoFilter, PatientPackage, PatientProfile } from "@/lib/types";

type PatientListItem = HomePatientListItem;

type Tab = "patients" | "import";

const RADIUS_OPTIONS = [25, 50, 100];

function isPatientPackage(value: unknown): value is PatientPackage {
  if (!value || typeof value !== "object") return false;
  const pkg = value as PatientPackage;
  return typeof pkg.slug === "string" && Array.isArray(pkg.lines);
}

interface HomePageClientProps {
  initial: InitialHomeData;
}

export default function HomePageClient({ initial }: HomePageClientProps) {
  const router = useRouter();
  const packageFetchGen = useRef(0);
  const trialsFetchGen = useRef(0);
  const [tab, setTab] = useState<Tab>("patients");
  const [patients, setPatients] = useState<PatientListItem[]>(initial.patients);
  const [patientSlug, setPatientSlug] = useState(initial.patientSlug);
  const [patientPackage, setPatientPackage] = useState<PatientPackage | null>(
    initial.patientPackage
  );
  const [discoveryPreview, setDiscoveryPreview] =
    useState<HomeDiscoveryPreview | null>(initial.discoveryPreview);
  const [loadingPatients, setLoadingPatients] = useState(
    initial.patients.length === 0
  );
  const [loadingPackage, setLoadingPackage] = useState(false);
  const [loadingTrials, setLoadingTrials] = useState(false);
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
    if (initial.patients.length > 0) return;

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
  }, [initial.patients.length]);

  function trialsQuery(slug: string): string {
    const demoPart = slug === "hero" ? "&demo=1" : "";
    return `/api/trials?patientSlug=${encodeURIComponent(slug)}&geo=${encodeURIComponent(JSON.stringify(geo))}${demoPart}`;
  }

  useEffect(() => {
    if (!patientSlug || tab !== "patients") return;

    const fetchId = ++trialsFetchGen.current;
    const controller = new AbortController();

    async function loadTrials() {
      setLoadingTrials(true);
      try {
        const trialsRes = await fetch(trialsQuery(patientSlug), {
          signal: controller.signal,
        });
        if (fetchId !== trialsFetchGen.current) return;
        if (trialsRes.ok) {
          setDiscoveryPreview(
            (await trialsRes.json()) as HomeDiscoveryPreview
          );
        } else {
          setDiscoveryPreview(null);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (fetchId === trialsFetchGen.current) {
          setDiscoveryPreview(null);
        }
      } finally {
        if (fetchId === trialsFetchGen.current) {
          setLoadingTrials(false);
        }
      }
    }

    void loadTrials();
    return () => controller.abort();
  }, [patientSlug, tab, geo]);

  useEffect(() => {
    if (!patientSlug || tab !== "patients") return;

    const isInitialSlug =
      patientSlug === initial.patientSlug &&
      initial.patientPackage &&
      patientPackage?.slug === initial.patientSlug;
    if (isInitialSlug) return;

    const fetchId = ++packageFetchGen.current;
    const controller = new AbortController();

    async function loadPackage() {
      setLoadingPackage(true);
      try {
        const pkgRes = await fetch(`/api/patients/${patientSlug}`, {
          signal: controller.signal,
        });
        const pkgData: unknown = await pkgRes.json();
        if (!pkgRes.ok || !isPatientPackage(pkgData)) {
          throw new Error("Unable to load patient package.");
        }
        if (fetchId === packageFetchGen.current) {
          setPatientPackage(pkgData);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (fetchId === packageFetchGen.current) {
          setPatientPackage(null);
          setLoadError(
            err instanceof Error ? err.message : "Unable to load patient package."
          );
        }
      } finally {
        if (fetchId === packageFetchGen.current) {
          setLoadingPackage(false);
        }
      }
    }

    void loadPackage();
    return () => controller.abort();
  }, [
    patientSlug,
    tab,
    initial.patientSlug,
    initial.patientPackage,
    patientPackage?.slug,
  ]);

  function geoQuery(demo = false): string {
    const demoPart = demo ? "&demo=1" : "";
    return `&geo=${encodeURIComponent(JSON.stringify(geo))}${demoPart}`;
  }

  function runPreScreen(demo = false) {
    setLoading(true);
    router.push(`/results?patientSlug=${patientSlug}${geoQuery(demo)}`);
  }

  function startDemo() {
    setPatientSlug("hero");
    runPreScreen(true);
  }

  function parsePaste() {
    const chart = parsePastedChart(pasteText || PASTE_SAMPLE, {
      displayName: "Pasted patient note",
    });
    setParsedLines(chart.lines);
    setExtractedProfile(null);
  }

  async function extractProfileFromPaste() {
    const lines = parsedLines ?? [];
    const chart = {
      patient_id: "paste-import",
      display_name: "Pasted patient note",
      lines: lines.length
        ? lines
        : parsePastedChart(pasteText || PASTE_SAMPLE, {
            displayName: "Pasted patient note",
          }).lines,
    };
    if (!parsedLines?.length) setParsedLines(chart.lines);
    setProfileLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart }),
      });
      const data = (await res.json()) as {
        profile?: PatientProfile;
        error?: string;
      };
      if (!res.ok || !data.profile) {
        throw new Error(data.error ?? "Profile extraction failed.");
      }
      setExtractedProfile(data.profile);
      saveSessionChart(chart, data.profile);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Profile extraction failed."
      );
    } finally {
      setProfileLoading(false);
    }
  }

  function runPasteMatch() {
    if (!parsedLines?.length) return;
    const chart = {
      patient_id: "paste-import",
      display_name: "Pasted patient note",
      lines: parsedLines,
    };
    saveSessionChart(chart, extractedProfile ?? undefined);
    setLoading(true);
    router.push(`/results?source=session${geoQuery()}`);
  }

  function handleFileDrop(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setPasteText(text);
      const chart = parsePastedChart(text, {
        displayName: "Pasted patient note",
      });
      setParsedLines(chart.lines);
      setExtractedProfile(null);
    };
    reader.readAsText(file);
  }

  function updateParsedLine(
    id: string,
    field: "section" | "text",
    value: string
  ) {
    setParsedLines((prev) =>
      prev?.map((l) => (l.id === id ? { ...l, [field]: value } : l)) ?? null
    );
    setExtractedProfile(null);
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
        </header>

        {loadError && (
          <div className="mb-6 rounded-2xl border border-crimson/30 bg-crimson-light px-5 py-4 text-sm text-crimson">
            {loadError}
          </div>
        )}

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("patients")}
            className={`lumen-focus rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === "patients"
                ? "bg-ink text-paper"
                : "border border-rule text-ink-muted hover:text-ink"
            }`}
          >
            Patients
          </button>
          <button
            type="button"
            onClick={() => setTab("import")}
            className={`lumen-focus rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === "import"
                ? "bg-ink text-paper"
                : "border border-rule text-ink-muted hover:text-ink"
            }`}
          >
            Import chart
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          <section className="animate-fade-up stagger-2 rounded-2xl border border-rule bg-paper shadow-[var(--shadow-soft)]">
            {tab === "patients" ? (
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
                          {`${p.display_name} · ${p.mrn}`}
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
                    {geo.label}
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

                      <div className="mt-8 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => runPreScreen(false)}
                          disabled={loading}
                          className="lumen-focus rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-paper shadow-sm transition-all hover:bg-sage-dark disabled:opacity-50"
                        >
                          {loading ? "Running…" : "Run pre-screen (live)"}
                        </button>
                        <button
                          type="button"
                          onClick={startDemo}
                          disabled={loading}
                          className="lumen-focus rounded-lg border-2 border-copper bg-copper/10 px-5 py-2.5 text-sm font-semibold text-copper transition-all hover:bg-copper/20 disabled:opacity-50"
                        >
                          Start 3-min demo
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="px-6 py-6 sm:px-8">
                <p className="text-sm text-ink-muted">
                  Paste or upload a de-identified oncology note. Lumen parses
                  chart lines, extracts a structured profile, and runs
                  criterion-level pre-screening with cited evidence.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value);
                    setParsedLines(null);
                    setExtractedProfile(null);
                  }}
                  placeholder={PASTE_SAMPLE}
                  rows={8}
                  className="lumen-focus mt-4 w-full rounded-lg border border-rule-strong bg-parchment px-4 py-3 text-sm leading-relaxed text-ink"
                />
                <div className="mt-3">
                  <label className="text-xs font-semibold uppercase text-ink-faint">
                    Or drop a .txt file
                  </label>
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    className="mt-1 block w-full text-sm text-ink-muted"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileDrop(file);
                    }}
                  />
                </div>
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
                      Confirm chart lines ({parsedLines.length})
                    </p>
                    <ul className="mt-3 space-y-3">
                      {parsedLines.map((l) => (
                        <li key={l.id} className="grid gap-1 sm:grid-cols-[4rem_6rem_1fr]">
                          <span className="font-mono text-xs text-copper/70">
                            {l.id}
                          </span>
                          <input
                            value={l.section}
                            onChange={(e) =>
                              updateParsedLine(l.id, "section", e.target.value)
                            }
                            className="rounded border border-rule bg-paper px-2 py-1 text-xs"
                          />
                          <input
                            value={l.text}
                            onChange={(e) =>
                              updateParsedLine(l.id, "text", e.target.value)
                            }
                            className="rounded border border-rule bg-paper px-2 py-1 text-sm"
                          />
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
                      Confirm & run pre-screen
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="animate-fade-up stagger-3 space-y-4">
            <PipelineArchitecture />
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
              {loadingTrials && (
                <p className="mt-3 text-sm text-ink-muted">
                  Searching ClinicalTrials.gov…
                </p>
              )}
              {!loadingTrials && discoveryPreview?.trials?.length ? (
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
                    {discoveryPreview.trials.map((t) => (
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
              ) : !loadingTrials ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  Trials discovered based on diagnosis, biomarkers, and patient
                  location.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
