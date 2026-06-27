import type { GeoFilter, PatientProfile, SearchSummary } from "../types";
import type { CTGovSearchParams } from "./client";
import {
  configuredDiscoveryPhases,
  configuredDiscoveryStatuses,
} from "./client";

function normalizeCondition(profile: PatientProfile, fallback?: string): string {
  const primary = profile.diagnosis.primary.toLowerCase();
  const histology = profile.diagnosis.histology?.toLowerCase() ?? "";

  if (
    /lung|nsclc|non-small cell|adenocarcinoma/i.test(primary) ||
    /lung|adenocarcinoma/i.test(histology)
  ) {
    return "non-small cell lung cancer";
  }

  const parts: string[] = [];
  if (profile.diagnosis.primary) parts.push(profile.diagnosis.primary);
  if (profile.diagnosis.histology && !primary.includes(histology)) {
    parts.push(profile.diagnosis.histology);
  }
  if (parts.length) return parts.join(" ");
  return fallback ?? "cancer";
}

function buildSearchTerms(profile: PatientProfile): string[] {
  const terms: string[] = [];

  for (const b of profile.biomarkers) {
    if (/positive|detected|mutat|delet|amplif/i.test(b.status)) {
      terms.push(b.name);
    }
  }

  for (const t of profile.prior_therapies.slice(0, 2)) {
    terms.push(t.name);
  }

  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
  return unique.slice(0, 4);
}

export function buildSearchQuery(
  profile: PatientProfile,
  fallbackDiagnosis?: string,
  geoFilter?: GeoFilter
): { params: CTGovSearchParams; summary: SearchSummary } {
  const status = configuredDiscoveryStatuses();
  const phases = configuredDiscoveryPhases();
  const condition = normalizeCondition(profile, fallbackDiagnosis);
  const terms = buildSearchTerms(profile);

  return {
    params: {
      condition,
      terms: terms.length ? terms : undefined,
      status,
      phases,
      geo: geoFilter,
      pageSize: 25,
    },
    summary: {
      condition,
      terms,
      status,
      phases,
      geo: geoFilter,
    },
  };
}
