import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

const ALLOWED = new Set([
  "naive-baseline",
  "resolution-after-echo",
  "golden-profile",
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ fixture: string }> }
) {
  const { fixture } = await context.params;
  if (!ALLOWED.has(fixture)) {
    return NextResponse.json({ error: "Unknown fixture." }, { status: 404 });
  }

  try {
    const path = join(process.cwd(), "data", "demo", `${fixture}.json`);
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Fixture not found." },
      { status: 404 }
    );
  }
}
