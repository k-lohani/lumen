import { getPatientPackage } from "@/lib/db/patientPackage";
import { listPatients } from "@/lib/db/patients";
import type { PatientPackage } from "@/lib/types";

export type HomePatientListItem = {
  slug: string;
  mrn: string;
  display_name: string;
  primary_diagnosis: string;
  chart_synced_at: string;
  source_system: string;
  line_count: number;
};

export type HomeDiscoveryPreview = {
  trials: {
    nct_id: string;
    title: string;
    phase?: string;
    status: string;
    recruiting_sites_nearby?: number;
  }[];
  discovery: {
    search_summary: {
      condition: string;
      terms: string[];
      status: string[];
      phases: string[];
      geo?: { lat: number; lng: number; radiusMi: number; label: string };
    };
    discovered_at?: string;
  } | null;
};

export interface InitialHomeData {
  patients: HomePatientListItem[];
  patientSlug: string;
  patientPackage: PatientPackage | null;
  discoveryPreview: HomeDiscoveryPreview | null;
}

export async function loadInitialHomeData(
  preferredSlug = "hero"
): Promise<InitialHomeData> {
  const patients = (await listPatients()) as HomePatientListItem[];
  const patientSlug = patients.some((p) => p.slug === preferredSlug)
    ? preferredSlug
    : (patients[0]?.slug ?? preferredSlug);

  let patientPackage: PatientPackage | null = null;

  if (patients.length) {
    try {
      patientPackage = await getPatientPackage(patientSlug);
    } catch {
      patientPackage = null;
    }
  }

  return {
    patients,
    patientSlug,
    patientPackage,
    discoveryPreview: null,
  };
}
