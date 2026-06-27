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
    /breast|ductal|lobular|mammary/i.test(primary) ||
    /breast|ductal|lobular/i.test(histology)
  ) {
    return "HER2 positive breast cancer";
  }

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

function simplifySearchTerm(name: string): string {
  const n = name.trim();
  if (/her2/i.test(n)) return "HER2";
  if (/egfr/i.test(n)) return "EGFR";
  if (/alk/i.test(n)) return "ALK";
  if (/pik3ca|pi3k/i.test(n)) return "PIK3CA";
  return n.split(/\s+/)[0];
}

function buildSearchTerms(profile: PatientProfile): string[] {
  const terms: string[] = [];

  for (const b of profile.biomarkers) {
    if (!/positive|detected|mutat|delet|amplif/i.test(b.status)) continue;
    const name = b.name.trim();
    if (/^(er|pr|estrogen receptor|progesterone receptor)$/i.test(name)) continue;
    terms.push(simplifySearchTerm(name));
  }

  for (const t of profile.prior_therapies.slice(0, 1)) {
    terms.push(t.name.split(/\s+/)[0]);
  }

  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
  // CT.gov query.term ANDs tokens — keep search broad
  return unique.slice(0, 1);
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
