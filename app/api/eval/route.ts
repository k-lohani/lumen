import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import type { EvalMetrics } from "@/lib/types";

export async function GET() {
  try {
    const path = join(process.cwd(), "data", "eval", "results.json");
    const metrics = JSON.parse(readFileSync(path, "utf-8")) as EvalMetrics;
    return NextResponse.json(metrics);
  } catch {
    return NextResponse.json(
      { error: "Eval results not found. Run npm run eval first." },
      { status: 404 }
    );
  }
}
