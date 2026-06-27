import { readFileSync } from "fs";
import { join } from "path";
import type { RawChart } from "../types";
import { preferFileCharts } from "../productConfig";
import { lookupPatientUuid } from "./ensurePatient";
import { tryGetSupabaseAdmin, isSupabaseConfigured } from "../supabase/server";

export interface PatientSummary {
  slug: string;
  mrn: string;
  display_name: string;
  primary_diagnosis: string;
  chart_synced_at: string;
  line_count: number;
  sex: string;
  date_of_birth: string;
  source_system: string;
}

export interface ChartLineRow {
  line_id: string;
  section: string;
  text: string;
  document_type: string;
  recorded_at: string;
}

interface PatientRow {
  id: string;
  slug: string;
  mrn: string;
  display_name: string;
  primary_diagnosis: string;
  chart_synced_at: string;
  sex: string;
  date_of_birth: string;
  source_system: string;
}

function loadChartFromFile(slug: string): RawChart | null {
  try {
    const path = join(process.cwd(), "data", "charts", `${slug}.json`);
    return JSON.parse(readFileSync(path, "utf-8")) as RawChart;
  } catch {
    return null;
  }
}

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

function chartToLineRows(chart: RawChart): ChartLineRow[] {
  return chart.lines.map((l) => ({
    line_id: l.id,
    section: l.section,
    text: l.text,
    document_type: sectionToDocumentType(l.section),
    recorded_at: "2026-06-10",
  }));
}

function fallbackPatientSummaries(): PatientSummary[] {
  const slugs = ["hero", "variant-echo-on-file", "variant-prior-tki", "demo-her2-breast"];
  const meta: Record<string, Partial<PatientSummary>> = {
    hero: {
      mrn: "MRN-2024-018392",
      primary_diagnosis: "Stage IV lung adenocarcinoma",
      chart_synced_at: new Date().toISOString(),
      source_system: "Epic Clarity",
    },
    "variant-echo-on-file": {
      mrn: "MRN-2024-018393",
      primary_diagnosis: "Stage IV lung adenocarcinoma",
      chart_synced_at: new Date().toISOString(),
      source_system: "Epic Clarity",
    },
    "variant-prior-tki": {
      mrn: "MRN-2024-024871",
      primary_diagnosis: "Stage IV lung adenocarcinoma",
      chart_synced_at: new Date().toISOString(),
      source_system: "Epic Clarity",
    },
    "demo-her2-breast": {
      mrn: "MRN-2025-041203",
      primary_diagnosis: "Metastatic HER2-positive breast cancer",
      chart_synced_at: new Date().toISOString(),
      source_system: "Epic Clarity",
    },
  };
  return slugs.flatMap((slug) => {
    const chart = loadChartFromFile(slug);
    if (!chart) return [];
    return [
      {
        slug,
        mrn: meta[slug]?.mrn ?? slug,
        display_name: chart.display_name.replace(/\s*\(.*\)$/, ""),
        primary_diagnosis: meta[slug]?.primary_diagnosis ?? "",
        chart_synced_at: meta[slug]?.chart_synced_at ?? new Date().toISOString(),
        line_count: chart.lines.length,
        sex:
          slug === "variant-prior-tki"
            ? "M"
            : slug === "demo-her2-breast"
              ? "F"
              : "F",
        date_of_birth:
          slug === "variant-prior-tki"
            ? "1962-11-08"
            : slug === "demo-her2-breast"
              ? "1971-09-22"
              : "1966-03-15",
        source_system: meta[slug]?.source_system ?? "Epic Clarity",
      },
    ];
  });
}

export async function listPatients(): Promise<PatientSummary[]> {
  const fromFiles = fallbackPatientSummaries();

  try {
    const db = tryGetSupabaseAdmin();
    if (!db) return fromFiles;

    const { data: patients, error } = await db
      .from("lumen_patients")
      .select("id, slug, mrn, display_name, primary_diagnosis, chart_synced_at, sex, date_of_birth, source_system")
      .order("display_name");

    if (error || !patients?.length) {
      return fromFiles.length ? fromFiles : fallbackPatientSummaries();
    }

    const summaries: PatientSummary[] = [];
    for (const p of patients as PatientRow[]) {
      const { count } = await db
        .from("lumen_chart_lines")
        .select("*", { count: "exact", head: true })
        .eq("patient_id", p.id);
      const fileChart = loadChartFromFile(p.slug);
      const lineCount = fileChart?.lines.length ?? count ?? 0;
      summaries.push({
        slug: p.slug,
        mrn: p.mrn,
        display_name: p.display_name,
        primary_diagnosis: p.primary_diagnosis,
        chart_synced_at: p.chart_synced_at,
        line_count: lineCount,
        sex: p.sex,
        date_of_birth: p.date_of_birth,
        source_system: p.source_system,
      });
    }

    if (
      preferFileCharts() &&
      fromFiles.length > 0 &&
      (summaries.length === 0 ||
        summaries.every((s) => s.line_count === 0))
    ) {
      return fromFiles;
    }

    if (preferFileCharts() && fromFiles.length > 0) {
      const slugs = new Set(summaries.map((s) => s.slug));
      for (const filePatient of fromFiles) {
        if (!slugs.has(filePatient.slug)) {
          summaries.push(filePatient);
        }
      }
      summaries.sort((a, b) => a.display_name.localeCompare(b.display_name));
    }

    return summaries.length ? summaries : fromFiles;
  } catch {
    return fromFiles.length ? fromFiles : fallbackPatientSummaries();
  }
}

function requireChart(slug: string): RawChart {
  const chart = loadChartFromFile(slug);
  if (!chart) {
    throw new Error(`Chart not found for patient: ${slug}`);
  }
  return chart;
}

export async function getPatientWithChart(slug: string): Promise<{
  patient: PatientSummary;
  chart: RawChart;
  lines: ChartLineRow[];
  patientUuid: string | null;
}> {
  if (slug.startsWith("intake-")) {
    const db = tryGetSupabaseAdmin();
    if (!db) throw new Error(`Patient not found: ${slug}`);

    const { data: row, error } = await db
      .from("lumen_patients")
      .select("id, slug, mrn, display_name, primary_diagnosis, chart_synced_at, sex, date_of_birth, source_system")
      .eq("slug", slug)
      .single();

    if (error || !row) throw new Error(`Patient not found: ${slug}`);

    const { data: lineRows, error: linesError } = await db
      .from("lumen_chart_lines")
      .select("line_id, section, text, document_type, recorded_at")
      .eq("patient_id", row.id)
      .order("line_id");

    if (linesError || !lineRows?.length) {
      throw new Error(`Chart not found for patient: ${slug}`);
    }

    const lines = lineRows as ChartLineRow[];
    const chart: RawChart = {
      patient_id: row.slug,
      display_name: row.display_name,
      lines: lines.map((l) => ({
        id: l.line_id,
        section: l.section,
        text: l.text,
      })),
    };

    return {
      patient: rowToSummary(row as PatientRow, lines.length),
      chart,
      lines,
      patientUuid: row.id,
    };
  }

  const fileChart = loadChartFromFile(slug);
  const filePatient = fallbackPatientSummaries().find((p) => p.slug === slug);

  if (preferFileCharts() && fileChart && filePatient) {
    const patientUuid = await lookupPatientUuid(slug);
    return {
      patient: filePatient,
      chart: fileChart,
      lines: chartToLineRows(fileChart),
      patientUuid,
    };
  }

  try {
    const db = tryGetSupabaseAdmin();
    if (!db) {
      const chart = requireChart(slug);
      const patient =
        fallbackPatientSummaries().find((p) => p.slug === slug) ??
        fallbackPatientSummaries()[0];
      if (!patient) throw new Error(`Patient not found: ${slug}`);
      return {
        patient,
        chart,
        lines: chartToLineRows(chart),
        patientUuid: null,
      };
    }

    const { data: row, error } = await db
      .from("lumen_patients")
      .select("id, slug, mrn, display_name, primary_diagnosis, chart_synced_at, sex, date_of_birth, source_system")
      .eq("slug", slug)
      .single();

    if (error || !row) {
      const chart = requireChart(slug);
      const patient =
        fallbackPatientSummaries().find((p) => p.slug === slug) ??
        fallbackPatientSummaries()[0];
      if (!patient) throw new Error(`Patient not found: ${slug}`);
      return {
        patient,
        chart,
        lines: chartToLineRows(chart),
        patientUuid: null,
      };
    }

    const { data: lineRows, error: linesError } = await db
      .from("lumen_chart_lines")
      .select("line_id, section, text, document_type, recorded_at")
      .eq("patient_id", row.id)
      .order("line_id");

    if (linesError || !lineRows?.length) {
      const chart = requireChart(slug);
      return {
        patient: rowToSummary(row as PatientRow, chart.lines.length),
        chart,
        lines: chartToLineRows(chart),
        patientUuid: row.id,
      };
    }

    const lines = lineRows as ChartLineRow[];
    const chart: RawChart = {
      patient_id: row.slug,
      display_name: row.display_name,
      lines: lines.map((l) => ({
        id: l.line_id,
        section: l.section,
        text: l.text,
      })),
    };

    return {
      patient: rowToSummary(row as PatientRow, lines.length),
      chart,
      lines,
      patientUuid: row.id,
    };
  } catch (error) {
    const chart = loadChartFromFile(slug);
    if (chart) {
      const patient =
        fallbackPatientSummaries().find((p) => p.slug === slug) ??
        fallbackPatientSummaries()[0];
      if (patient) {
        return {
          patient,
          chart,
          lines: chartToLineRows(chart),
          patientUuid: null,
        };
      }
    }
    throw error;
  }
}

function rowToSummary(row: PatientRow, lineCount: number): PatientSummary {
  return {
    slug: row.slug,
    mrn: row.mrn,
    display_name: row.display_name,
    primary_diagnosis: row.primary_diagnosis,
    chart_synced_at: row.chart_synced_at,
    line_count: lineCount,
    sex: row.sex,
    date_of_birth: row.date_of_birth,
    source_system: row.source_system,
  };
}

export { isSupabaseConfigured };
