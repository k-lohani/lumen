import type { PatientPackage } from "../types";
import { listPatients, getPatientWithChart } from "./patients";
import { getCachedProfile } from "./profileCache";
import { computeChartHash } from "../chartHash";

export async function getPatientPackage(slug: string): Promise<PatientPackage> {
  const { patient, chart, lines, patientUuid } = await getPatientWithChart(slug);

  let profile;
  if (patientUuid) {
    const chartHash = computeChartHash(chart);
    profile = (await getCachedProfile(patientUuid, chartHash)) ?? undefined;
  }

  return {
    slug: patient.slug,
    mrn: patient.mrn,
    display_name: patient.display_name,
    primary_diagnosis: patient.primary_diagnosis,
    demographics: {
      date_of_birth: patient.date_of_birth,
      sex: patient.sex,
    },
    chart_synced_at: patient.chart_synced_at,
    source_system: patient.source_system,
    line_count: patient.line_count,
    lines,
    profile,
  };
}

export async function listPatientPackages(): Promise<PatientPackage[]> {
  const patients = await listPatients();
  return patients.map((p) => ({
    slug: p.slug,
    mrn: p.mrn,
    display_name: p.display_name,
    primary_diagnosis: p.primary_diagnosis,
    demographics: {
      date_of_birth: p.date_of_birth,
      sex: p.sex,
    },
    chart_synced_at: p.chart_synced_at,
    source_system: p.source_system,
    line_count: p.line_count,
    lines: [],
  }));
}
