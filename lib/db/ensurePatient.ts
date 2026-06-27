import { computeChartHash } from "../chartHash";
import type { PatientProfile, RawChart } from "../types";
import { tryGetSupabaseAdmin } from "../supabase/server";

const LIBRARY_META: Record<
  string,
  {
    mrn: string;
    primary_diagnosis: string;
    date_of_birth: string;
    sex: "F" | "M";
    source_system: string;
  }
> = {
  hero: {
    mrn: "MRN-2024-018392",
    primary_diagnosis: "Stage IV lung adenocarcinoma",
    date_of_birth: "1966-03-15",
    sex: "F",
    source_system: "Epic Clarity",
  },
  "variant-echo-on-file": {
    mrn: "MRN-2024-018393",
    primary_diagnosis: "Stage IV lung adenocarcinoma",
    date_of_birth: "1966-03-15",
    sex: "F",
    source_system: "Epic Clarity",
  },
  "variant-prior-tki": {
    mrn: "MRN-2024-024871",
    primary_diagnosis: "Stage IV lung adenocarcinoma",
    date_of_birth: "1962-11-08",
    sex: "M",
    source_system: "Epic Clarity",
  },
  "demo-her2-breast": {
    mrn: "MRN-2025-041203",
    primary_diagnosis: "Metastatic HER2-positive breast cancer",
    date_of_birth: "1971-09-22",
    sex: "F",
    source_system: "Epic Clarity",
  },
};

function sectionToDocumentType(section: string): string {
  const map: Record<string, string> = {
    Demographics: "Progress Note",
    Molecular: "Genomic Report",
    Treatment: "Treatment Summary",
    Performance: "Progress Note",
    Imaging: "Imaging Report",
    Labs: "Lab Report",
    Comorbidities: "Progress Note",
    Vitals: "Clinic Visit",
    Consent: "Administrative Note",
    Cardiac: "Imaging Report",
  };
  return map[section] ?? "Clinical Note";
}

function resolveSlug(chart: RawChart): string {
  if (chart.patient_id.startsWith("intake-")) {
    return chart.patient_id;
  }
  if (LIBRARY_META[chart.patient_id]) {
    return chart.patient_id;
  }
  const hash = computeChartHash(chart).slice(0, 8);
  return `intake-${hash}`;
}

function derivePatientFields(
  chart: RawChart,
  slug: string,
  profile?: PatientProfile
) {
  const library = LIBRARY_META[slug];
  const sex =
    profile?.demographics.sex === "M" ||
    profile?.demographics.sex === "F"
      ? profile.demographics.sex
      : (library?.sex ?? "OTHER");

  const age = profile?.demographics.age;
  const dob =
    library?.date_of_birth ??
    (age != null
      ? `${new Date().getFullYear() - age}-01-01`
      : "1970-01-01");

  return {
    slug,
    mrn: library?.mrn ?? `INTAKE-${slug.replace(/^intake-/, "").toUpperCase()}`,
    display_name: chart.display_name.replace(/\s*\(.*\)$/, ""),
    primary_diagnosis:
      profile?.diagnosis.primary ??
      library?.primary_diagnosis ??
      "Pending review",
    date_of_birth: dob,
    sex: sex === "M" || sex === "F" ? sex : "OTHER",
    source_system: library?.source_system ?? "Chart import",
    chart_synced_at: new Date().toISOString(),
  };
}

async function syncChartLines(
  patientId: string,
  chart: RawChart
): Promise<void> {
  const db = tryGetSupabaseAdmin();
  if (!db) return;

  await db.from("lumen_chart_lines").delete().eq("patient_id", patientId);

  const rows = chart.lines.map((l) => ({
    patient_id: patientId,
    line_id: l.id,
    section: l.section,
    text: l.text,
    document_type: sectionToDocumentType(l.section),
    recorded_at: new Date().toISOString().slice(0, 10),
  }));

  if (rows.length) {
    const { error } = await db.from("lumen_chart_lines").insert(rows);
    if (error) throw new Error(`Failed to sync chart lines: ${error.message}`);
  }
}

export async function ensurePatientRecord(
  chart: RawChart,
  profile?: PatientProfile
): Promise<{
  patientUuid: string | null;
  slug: string;
  mrn: string;
  persisted: boolean;
}> {
  const db = tryGetSupabaseAdmin();
  const slug = resolveSlug(chart);
  const fields = derivePatientFields(chart, slug, profile);

  if (!db) {
    return {
      patientUuid: null,
      slug,
      mrn: fields.mrn,
      persisted: false,
    };
  }

  const { data: existing } = await db
    .from("lumen_patients")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  let patientId: string;

  if (existing?.id) {
    patientId = existing.id;
    await db
      .from("lumen_patients")
      .update({
        display_name: fields.display_name,
        primary_diagnosis: fields.primary_diagnosis,
        chart_synced_at: fields.chart_synced_at,
      })
      .eq("id", patientId);
  } else {
    const { data: inserted, error } = await db
      .from("lumen_patients")
      .insert(fields)
      .select("id")
      .single();

    if (error || !inserted) {
      throw new Error(
        `Failed to create patient record: ${error?.message ?? "unknown"}`
      );
    }
    patientId = inserted.id;
  }

  if (slug.startsWith("intake-") || !LIBRARY_META[slug]) {
    await syncChartLines(patientId, {
      ...chart,
      patient_id: slug,
    });
  }

  return { patientUuid: patientId, slug, mrn: fields.mrn, persisted: true };
}

export async function lookupPatientUuid(slug: string): Promise<string | null> {
  const db = tryGetSupabaseAdmin();
  if (!db) return null;

  const { data } = await db
    .from("lumen_patients")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  return data?.id ?? null;
}
