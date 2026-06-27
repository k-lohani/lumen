import { NextResponse } from "next/server";
import {
  listTrialSummaries,
  loadTrialsByNctIds,
  syncAllTrialsFromRegistry,
} from "@/lib/db/trials";
import { getLastDiscoveryForPatient } from "@/lib/db/discoveryCache";
import { getPatientWithChart } from "@/lib/db/patients";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { discoverTrialsForPatient } from "@/lib/clinicaltrials/discoverTrials";
import { extractProfile } from "@/lib/pipeline/extractProfile";
import { isDemoModeRequest } from "@/lib/demo/mode";
import { loadDiscoveryPreview } from "@/lib/demo/loadFixtures";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      patientSlug?: string;
      demo?: boolean;
    };
    const slug = body.patientSlug;
    if (!slug) {
      return NextResponse.json(
        { error: "patientSlug is required." },
        { status: 400 }
      );
    }

    if (isDemoModeRequest(request, body)) {
      const preview = loadDiscoveryPreview(slug);
      return NextResponse.json({
        ...preview,
        source: "demo-fixture",
      });
    }

    const { chart, patient, patientUuid } = await getPatientWithChart(slug);
    const profile = await extractProfile(chart, { useGoldenProfile: true });
    const { discovery } = await discoverTrialsForPatient(profile, {
      patientUuid,
      fallbackDiagnosis: patient.primary_diagnosis,
      skipCache: true,
    });

    const trials = await loadTrialsByNctIds(discovery.nct_ids);
    return NextResponse.json({
      trials,
      discovery,
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
    const demoQuery = searchParams.get("demo") === "1";

    if (patientSlug && (demoQuery || isDemoModeRequest(request))) {
      const preview = loadDiscoveryPreview(patientSlug);
      return NextResponse.json({
        ...preview,
        source: "demo-fixture",
      });
    }

    if (patientSlug) {
      const { patientUuid } = await getPatientWithChart(patientSlug);
      if (patientUuid) {
        const discovery = await getLastDiscoveryForPatient(patientUuid);
        if (discovery) {
          const trials = await loadTrialsByNctIds(discovery.nct_ids);
          return NextResponse.json({
            trials,
            discovery,
            source: isSupabaseConfigured() ? "database" : "local",
          });
        }
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
  } catch {
    return NextResponse.json(
      { error: "Unable to load trial data." },
      { status: 500 }
    );
  }
}
