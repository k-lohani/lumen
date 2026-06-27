import { NextResponse } from "next/server";
import { isDemoModeRequest } from "@/lib/demo/mode";
import { loadGoldenProfile } from "@/lib/demo/loadFixtures";
import { computeChartHash } from "@/lib/chartHash";
import { extractProfile } from "@/lib/pipeline/extractProfile";
import type { RawChart } from "@/lib/types";

interface ProfileRequest {
  chart: RawChart;
  demo?: boolean;
}

export async function POST(request: Request) {
  let body: ProfileRequest;
  try {
    body = (await request.json()) as ProfileRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.chart?.lines?.length) {
    return NextResponse.json(
      { error: "chart with lines is required." },
      { status: 400 }
    );
  }

  if (isDemoModeRequest(request, body)) {
    const fixture = loadGoldenProfile();
    return NextResponse.json({
      profile: fixture.profile,
      chart_hash: fixture.chart_hash,
      patient_story: fixture.patient_story,
      demo: true,
    });
  }

  try {
    const profile = await extractProfile(body.chart, {
      useGoldenProfile: false,
    });
    return NextResponse.json({
      profile,
      chart_hash: computeChartHash(body.chart),
    });
  } catch (error) {
    console.error("Profile extraction error:", error);
    return NextResponse.json(
      { error: "Unable to extract profile from chart." },
      { status: 500 }
    );
  }
}
