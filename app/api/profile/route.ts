import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { computeChartHash } from "@/lib/chartHash";
import { getPatientWithChart } from "@/lib/db/patients";
import { extractProfile } from "@/lib/pipeline/extractProfile";
import { formatLlmError } from "@/lib/llm";
import { isDemoMode } from "@/lib/productConfig";
import type { RawChart } from "@/lib/types";

interface ProfileRequest {
  chart: RawChart;
  demoMode?: boolean;
  patientSlug?: string;
}

export async function POST(request: Request) {
  let body: ProfileRequest;
  try {
    body = (await request.json()) as ProfileRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const demoMode = isDemoMode(body.demoMode);

  if (demoMode && !body.chart?.lines?.length) {
    try {
      const { chart } = await getPatientWithChart(body.patientSlug ?? "hero");
      const profile = await extractProfile(chart, { useGoldenProfile: true });
      return NextResponse.json({
        profile,
        chart_hash: computeChartHash(chart),
        demo: true,
      });
    } catch (error) {
      console.error("Demo profile error:", error);
      return NextResponse.json(
        { error: "Demo profile unavailable." },
        { status: 500 }
      );
    }
  }

  if (!body.chart?.lines?.length) {
    return NextResponse.json(
      { error: "chart with lines is required." },
      { status: 400 }
    );
  }

  try {
    const profile = await extractProfile(body.chart, {
      useGoldenProfile: demoMode,
    });
    return NextResponse.json({
      profile,
      chart_hash: computeChartHash(body.chart),
      demo: demoMode || undefined,
    });
  } catch (error) {
    console.error("Profile extraction error:", error);
    return NextResponse.json(
      { error: formatLlmError(error) || "Unable to extract profile from chart." },
      { status: 500 }
    );
  }
}
