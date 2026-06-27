import { NextResponse } from "next/server";
import { computeChartHash, computeProfileHash } from "@/lib/chartHash";
import { getCachedVerdicts } from "@/lib/db/matchCache";
import {
  getDiscoveryCache,
  getLastDiscoveryForPatient,
} from "@/lib/db/discoveryCache";
import { getCachedProfile } from "@/lib/db/profileCache";
import { ensurePatientRecord } from "@/lib/db/ensurePatient";
import { getPatientWithChart } from "@/lib/db/patients";
import { loadGoldenMatch } from "@/lib/demo/loadFixtures";
import { runMatch } from "@/lib/pipeline/runMatch";
import {
  demoTrialLimit,
  disableCache,
  isDemoMode,
  useLiveLlm,
  usePinnedTrials,
} from "@/lib/productConfig";
import { formatLlmError, isAnthropicUnavailableError } from "@/lib/llm";
import { sseLine } from "@/lib/sse";
import type {
  GeoFilter,
  PatientProfile,
  PipelineProgressEvent,
  RawChart,
  TrialVerdict,
} from "@/lib/types";

interface MatchRequest {
  patientSlug?: string;
  chartId?: string;
  pinnedMode?: boolean;
  chart?: RawChart;
  geoFilter?: GeoFilter;
  profile?: PatientProfile;
  demoMode?: boolean;
}

interface MatchPayload {
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
  persisted?: boolean;
  session?: boolean;
  demo?: boolean;
  partial?: boolean;
  partial_note?: string;
}

function matchPipelineOptions(
  pinnedMode: boolean,
  patientUuid: string | null,
  geoFilter?: GeoFilter,
  onProgress?: (event: PipelineProgressEvent) => void
) {
  const liveLlm = useLiveLlm();
  return {
    patientUuid,
    pinnedMode,
    geoFilter,
    useGoldenProfile: !liveLlm,
    useRuleBased: !liveLlm,
    skipDiscoveryCache: disableCache(),
    onProgress,
  };
}

function wantsStream(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("text/event-stream");
}

function geoMatches(
  cached?: GeoFilter,
  requested?: GeoFilter
): boolean {
  return JSON.stringify(cached ?? null) === JSON.stringify(requested ?? null);
}

async function tryCachedMatch(
  patientSlug: string,
  patient: { mrn: string; display_name: string },
  patientUuid: string,
  chartHash: string,
  pinnedMode: boolean,
  geoFilter?: GeoFilter
): Promise<MatchPayload | null> {
  if (disableCache() || pinnedMode) return null;

  const cached = await getCachedVerdicts(patientUuid, chartHash);
  if (!cached) return null;

  let discovered_trials: number | undefined;
  let search_summary;
  const profile = await getCachedProfile(patientUuid, chartHash);
  if (profile) {
    const profileHash = computeProfileHash(profile);
    const discovery = await getDiscoveryCache(patientUuid, profileHash);
    if (discovery) {
      if (!geoMatches(discovery.search_params.geo, geoFilter)) {
        return null;
      }
      discovered_trials = discovery.nct_ids.length;
      search_summary = discovery.search_params;
    }
  }
  if (!discovered_trials) {
    const last = await getLastDiscoveryForPatient(patientUuid);
    if (last) {
      if (!geoMatches(last.search_params.geo, geoFilter)) {
        return null;
      }
      discovered_trials = last.nct_ids.length;
      search_summary = last.search_params;
    }
  }

  return {
    patientSlug,
    mrn: patient.mrn,
    display_name: patient.display_name,
    matched_at: cached.matched_at,
    discovered_trials,
    search_summary,
    verdicts: cached.verdicts,
    persisted: true,
  };
}

function buildDemoPayload(patientSlug: string): MatchPayload {
  const golden = loadGoldenMatch();
  return {
    patientSlug,
    mrn: golden.mrn,
    display_name: golden.display_name,
    matched_at: golden.matched_at,
    patient_story: golden.patient_story,
    discovered_trials: golden.discovered_trials,
    search_summary: golden.search_summary,
    verdicts: golden.verdicts.slice(0, demoTrialLimit()),
    persisted: false,
    demo: true,
  };
}

async function runFreshMatch(
  chart: RawChart,
  opts: {
    patientSlug: string;
    mrn: string;
    display_name: string;
    patientUuid: string | null;
    pinnedMode: boolean;
    geoFilter?: GeoFilter;
    onProgress?: (event: PipelineProgressEvent) => void;
    session?: boolean;
    persisted?: boolean;
  }
): Promise<MatchPayload> {
  const chartHash = computeChartHash(chart);
  const result = await runMatch(
    chart,
    matchPipelineOptions(
      opts.pinnedMode,
      opts.patientUuid,
      opts.geoFilter,
      opts.onProgress
    )
  );

  let matchedAt = new Date().toISOString();
  if (opts.patientUuid && !disableCache()) {
    matchedAt = await import("@/lib/db/matchCache").then((m) =>
      m.saveVerdicts(opts.patientUuid!, chartHash, result.verdicts)
    );
  }

  return {
    patientSlug: opts.patientSlug,
    mrn: opts.mrn,
    display_name: opts.display_name,
    matched_at: matchedAt,
    patient_story: result.patient_story,
    discovered_trials: result.discovery.discovered_trials,
    search_summary: result.discovery.search_summary,
    verdicts: result.verdicts,
    persisted: opts.persisted ?? Boolean(opts.patientUuid),
    session: opts.session,
    partial: result.partial,
    partial_note: result.partial_note,
  };
}

function streamDemoMatch(patientSlug: string): Response {
  const golden = loadGoldenMatch();
  const payload = buildDemoPayload(patientSlug);
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  void (async () => {
    try {
      for (const event of golden.demo_trail ?? []) {
        await writer.write(enc.encode(sseLine("progress", event)));
        await new Promise((r) => setTimeout(r, 80));
      }
      await writer.write(enc.encode(sseLine("done", payload)));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function streamMatch(
  run: (onProgress: (event: PipelineProgressEvent) => void) => Promise<MatchPayload>
): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  void (async () => {
    try {
      const payload = await run(async (event) => {
        await writer.write(enc.encode(sseLine("progress", event)));
      });
      if (payload.partial && payload.verdicts.length === 0) {
        await writer.write(
          enc.encode(
            sseLine("error", {
              message:
                payload.partial_note ??
                "Unable to complete eligibility analysis. Please try again.",
            })
          )
        );
      } else {
        await writer.write(enc.encode(sseLine("done", payload)));
      }
    } catch (error) {
      console.error("Match pipeline error:", error);
      await writer.write(
        enc.encode(
          sseLine("error", {
            message:
              isAnthropicUnavailableError(error)
                ? formatLlmError(error)
                : "Unable to complete eligibility analysis. Please try again.",
          })
        )
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  let body: MatchRequest;
  try {
    body = (await request.json()) as MatchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const patientSlug = body.patientSlug ?? body.chartId ?? "hero";
  const pinnedMode = body.pinnedMode ?? usePinnedTrials();
  const streaming = wantsStream(request);
  const demoMode = isDemoMode(body.demoMode);

  if (demoMode && !body.chart && patientSlug === "hero") {
    if (streaming) return streamDemoMatch(patientSlug);
    return NextResponse.json(buildDemoPayload(patientSlug));
  }

  try {
    if (body.chart) {
      const chart = body.chart;
      const { patientUuid, slug, mrn, persisted } = await ensurePatientRecord(
        chart,
        body.profile
      );
      const chartWithSlug = { ...chart, patient_id: slug };
      const matchOpts = {
        patientSlug: slug,
        mrn,
        display_name: chart.display_name,
        patientUuid,
        pinnedMode,
        geoFilter: body.geoFilter,
        session: true,
        persisted,
      };

      if (streaming) {
        return streamMatch((onProgress) =>
          runFreshMatch(chartWithSlug, { ...matchOpts, onProgress })
        );
      }

      return NextResponse.json(await runFreshMatch(chartWithSlug, matchOpts));
    }

    let { patient, chart, patientUuid } =
      await getPatientWithChart(patientSlug);

    if (!patientUuid) {
      const ensured = await ensurePatientRecord(chart);
      patientUuid = ensured.patientUuid;
    }

    const chartHash = computeChartHash(chart);
    const cached = patientUuid
      ? await tryCachedMatch(
          patientSlug,
          patient,
          patientUuid,
          chartHash,
          pinnedMode,
          body.geoFilter
        )
      : null;

    if (cached) {
      if (streaming) {
        return streamMatch(async (onProgress) => {
          onProgress({
            type: "stage_end",
            stage: "complete",
            message: "Loaded cached pre-screen",
          });
          return cached;
        });
      }
      return NextResponse.json(cached);
    }

    const matchOpts = {
      patientSlug,
      mrn: patient.mrn,
      display_name: patient.display_name,
      patientUuid,
      pinnedMode,
      geoFilter: body.geoFilter,
    };

    if (streaming) {
      return streamMatch((onProgress) =>
        runFreshMatch(chart, { ...matchOpts, onProgress })
      );
    }

    return NextResponse.json(await runFreshMatch(chart, matchOpts));
  } catch (error) {
    console.error("Match pipeline error:", error);
    const message = isAnthropicUnavailableError(error)
      ? formatLlmError(error)
      : "Unable to complete eligibility analysis. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
