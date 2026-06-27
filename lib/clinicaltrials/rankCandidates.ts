import type { GeoFilter, PatientProfile } from "../types";
import type { CTGovStudy } from "./client";
import { sitesNearGeo } from "./geoSites";

interface ProtocolSection {
  conditionsModule?: { conditions?: string[] };
  descriptionModule?: {
    briefSummary?: string;
    detailedDescription?: string;
  };
}

function studyText(study: CTGovStudy): string {
  const ps = (study.raw.protocolSection ?? {}) as ProtocolSection;
  const conditions = ps.conditionsModule?.conditions ?? [];
  const summary = ps.descriptionModule?.briefSummary ?? "";
  const detailed = ps.descriptionModule?.detailedDescription ?? "";
  return [study.title, ...conditions, summary, detailed, study.eligibilityText]
    .join(" ")
    .toLowerCase();
}

function keywordOverlap(text: string, keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}

export function rankCandidates(
  studies: CTGovStudy[],
  profile: PatientProfile,
  topK: number,
  geoFilter?: GeoFilter
): CTGovStudy[] {
  const keywords = [
    profile.diagnosis.primary,
    profile.diagnosis.histology,
    ...profile.biomarkers.map((b) => b.name),
    ...profile.prior_therapies.map((t) => t.name),
  ].filter(Boolean) as string[];

  const scored = studies.map((study) => {
    const text = studyText(study);
    let score = 0;

    if (study.status === "RECRUITING") score += 10;

    if (/phase 2|phase 3|phase 4/i.test(study.phase ?? "")) score += 5;

    score += keywordOverlap(text, keywords) * 8;

    for (const b of profile.biomarkers) {
      if (text.includes(b.name.toLowerCase())) score += 12;
    }

    if (geoFilter) {
      const nearby = sitesNearGeo(study.raw, geoFilter);
      if (nearby.length > 0) score += 15 + nearby.length * 2;
      else score -= 3;
    }

    if (
      profile.diagnosis.primary &&
      text.includes(profile.diagnosis.primary.toLowerCase().split(" ")[0])
    ) {
      score += 6;
    }

    return { study, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const ranked = topK > 0 ? scored.slice(0, topK) : scored;
  return ranked.map((s) => s.study);
}
