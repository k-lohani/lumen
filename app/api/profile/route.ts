import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { computeChartHash } from "@/lib/chartHash";
import { extractProfile } from "@/lib/pipeline/extractProfile";
import { formatLlmError } from "@/lib/llm";
import type { RawChart } from "@/lib/types";

interface ProfileRequest {
  chart: RawChart;
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
      { error: formatLlmError(error) || "Unable to extract profile from chart." },
      { status: 500 }
    );
  }
}
