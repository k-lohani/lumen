import { NextResponse } from "next/server";
import { listTrialSummaries, loadTrialsByNctIds } from "@/lib/db/trials";
import { ensurePatientRecord } from "@/lib/db/ensurePatient";
import { getPatientWithChart } from "@/lib/db/patients";
import { getCachedProfile } from "@/lib/db/profileCache";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { discoverTrialsForPatient } from "@/lib/clinicaltrials/discoverTrials";
import { extractProfile } from "@/lib/pipeline/extractProfile";
import { configuredTrialNcts } from "@/lib/clinicaltrials/client";
import { formatLlmError, isAnthropicUnavailableError } from "@/lib/llm";
import { useLiveDiscovery, useLiveLlm, usePinnedTrials, disableCache } from "@/lib/productConfig";
import type { GeoFilter } from "@/lib/types";
import { computeChartHash } from "@/lib/chartHash";

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

async function liveDiscoveryForSlug(
  patientSlug: string,
  geoFilter?: GeoFilter,
  skipCache = false
) {
  let { chart, patient, patientUuid } = await getPatientWithChart(patientSlug);

  if (!patientUuid) {
    const ensured = await ensurePatientRecord(chart);
    patientUuid = ensured.patientUuid;
  }

  const chartHash = computeChartHash(chart);
  const effectiveSkipCache = skipCache || disableCache();
  let profile =
    patientUuid && !effectiveSkipCache
      ? await getCachedProfile(patientUuid, chartHash)
      : null;

  if (!profile) {
    profile = await extractProfile(chart, {
      useGoldenProfile: !useLiveLlm(),
    });
  }

  const { discovery } = await discoverTrialsForPatient(profile, {
    patientUuid,
    fallbackDiagnosis: patient.primary_diagnosis,
    skipCache: effectiveSkipCache,
    geoFilter,
  });

  const trials = await loadTrialsByNctIds(discovery.nct_ids);
  return { trials, discovery, source: "ctgov" as const };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { patientSlug?: string; geoFilter?: GeoFilter };
    const slug = body.patientSlug;
    if (!slug) {
      return NextResponse.json(
        { error: "patientSlug is required." },
        { status: 400 }
      );
    }

    const result = await liveDiscoveryForSlug(slug, body.geoFilter, true);
    return NextResponse.json({
      ...result,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Trial discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientSlug = searchParams.get("patientSlug");
    const geoFilter = parseGeoParam(searchParams.get("geo"));

    if (patientSlug) {
      if (useLiveDiscovery()) {
        const result = await liveDiscoveryForSlug(patientSlug, geoFilter);
        return NextResponse.json({
          ...result,
          discovery: {
            search_summary: result.discovery.search_summary,
            discovered_at: new Date().toISOString(),
          },
        });
      }

      if (usePinnedTrials()) {
        const ncts = configuredTrialNcts();
        const trials = await loadTrialsByNctIds(ncts);
        return NextResponse.json({
          trials,
          discovery: {
            search_summary: {
              condition: "pinned portfolio",
              terms: [],
              status: ["RECRUITING"],
              phases: [],
            },
            discovered_at: new Date().toISOString(),
          },
          source: "portfolio",
        });
      }

      return NextResponse.json({
        trials: [],
        discovery: null,
        source: isSupabaseConfigured() ? "database" : "local",
      });
    }

    const trials = await listTrialSummaries();
    return NextResponse.json({
      trials,
      source: isSupabaseConfigured() ? "database" : "local",
    });
  } catch (error) {
    console.error("GET /api/trials:", error);
    const message = isAnthropicUnavailableError(error)
      ? formatLlmError(error)
      : "Unable to load trial data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
