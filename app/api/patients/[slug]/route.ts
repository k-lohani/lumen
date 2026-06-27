import { NextResponse } from "next/server";
import { getPatientPackage } from "@/lib/db/patientPackage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  try {
    const pkg = await getPatientPackage(slug);
    return NextResponse.json(pkg);
  } catch (error) {
    console.error(`GET /api/patients/${slug}:`, error);
    const message =
      error instanceof Error ? error.message : "Patient not found.";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
