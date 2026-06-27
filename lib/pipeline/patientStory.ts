import type { GeoFilter, PatientProfile } from "../types";

export function buildPatientStory(
  profile: PatientProfile,
  geo?: GeoFilter
): string {
  const sex =
    profile.demographics.sex === "F"
      ? "woman"
      : profile.demographics.sex === "M"
        ? "man"
        : "patient";
  const biomarkerStr = profile.biomarkers
    .slice(0, 2)
    .map((b) => `${b.name} ${b.status}`)
    .join(", ");
  const ecog = profile.performance_status
    ? `ECOG ${profile.performance_status.value}`
    : null;
  const parts = [
    `${profile.demographics.age}-year-old ${sex} with ${profile.diagnosis.primary}`,
    biomarkerStr ? `(${biomarkerStr})` : null,
    ecog,
  ].filter(Boolean);
  const geoPart = geo ? ` — screening trials near ${geo.label}` : "";
  return `${parts.join(", ")}${geoPart}.`;
}
