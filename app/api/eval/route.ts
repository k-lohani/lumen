import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import type { EvalMetrics } from "@/lib/types";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Eval endpoint is only available in development." },
      { status: 403 }
    );
  }

  try {
    const path = join(process.cwd(), "data", "eval", "results.json");
    const metrics = JSON.parse(readFileSync(path, "utf-8")) as EvalMetrics;
    return NextResponse.json(metrics);
  } catch {
    return NextResponse.json(
      { error: "Eval results not found. Run the eval CLI first." },
      { status: 404 }
    );
  }
}
