import { NextResponse } from "next/server";
import { listPatients } from "@/lib/db/patients";

export async function GET() {
  try {
    const patients = await listPatients();
    return NextResponse.json({ patients });
  } catch {
    return NextResponse.json(
      { error: "Unable to load patient list." },
      { status: 500 }
    );
  }
}
