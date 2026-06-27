import { NextResponse } from "next/server";
import { computeChartHash } from "@/lib/chartHash";
import { getCachedVerdicts, saveVerdicts } from "@/lib/db/matchCache";
import { getDiscoveryCache, getLastDiscoveryForPatient } from "@/lib/db/discoveryCache";
import { computeProfileHash } from "@/lib/chartHash";
import { getCachedProfile } from "@/lib/db/profileCache";
import { getPatientWithChart } from "@/lib/db/patients";
import { normalizeVerdicts } from "@/lib/matchCacheFile";
import { runMatch } from "@/lib/pipeline/runMatch";

interface MatchRequest {
  patientSlug?: string;
  chartId?: string;
  pinnedMode?: boolean;
}

export async function POST(request: Request) {
  let body: MatchRequest;
  try {
    body = (await request.json()) as MatchRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }

  const patientSlug = body.patientSlug ?? body.chartId ?? "hero";
  const pinnedMode = body.pinnedMode ?? false;

  try {
    const { patient, chart, patientUuid } =
      await getPatientWithChart(patientSlug);
    const chartHash = computeChartHash(chart);

    if (patientUuid && !pinnedMode) {
      const cached = await getCachedVerdicts(patientUuid, chartHash);
      if (cached) {
        let discovered_trials: number | undefined;
        let search_summary;
        const profile = await getCachedProfile(patientUuid, chartHash);
        if (profile) {
          const profileHash = computeProfileHash(profile);
          const discovery = await getDiscoveryCache(patientUuid, profileHash);
          if (discovery) {
            discovered_trials = discovery.nct_ids.length;
            search_summary = discovery.search_params;
          }
        }
        if (!discovered_trials) {
          const last = await getLastDiscoveryForPatient(patientUuid);
          if (last) {
            discovered_trials = last.nct_ids.length;
            search_summary = last.search_params;
          }
        }
        return NextResponse.json({
          patientSlug,
          mrn: patient.mrn,
          display_name: patient.display_name,
          matched_at: cached.matched_at,
          discovered_trials,
          search_summary,
          verdicts: cached.verdicts,
        });
      }
    }

    const result = await runMatch(chart, {
      patientUuid,
      pinnedMode,
    });

    let matchedAt = new Date().toISOString();
    if (patientUuid && !pinnedMode) {
      matchedAt = await saveVerdicts(patientUuid, chartHash, result.verdicts);
    }

    return NextResponse.json({
      patientSlug,
      mrn: patient.mrn,
      display_name: patient.display_name,
      matched_at: matchedAt,
      discovered_trials: result.discovery.discovered_trials,
      search_summary: result.discovery.search_summary,
      verdicts: pinnedMode
        ? normalizeVerdicts(result.verdicts)
        : result.verdicts,
    });
  } catch (error) {
    console.error("Match pipeline error:", error);
    return NextResponse.json(
      {
        error:
          "Unable to complete eligibility analysis. Please try again.",
      },
      { status: 500 }
    );
  }
}
