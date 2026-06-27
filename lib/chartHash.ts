import { createHash } from "crypto";
import type { RawChart } from "./types";

export function computeChartHash(chart: RawChart): string {
  const payload = [...chart.lines]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => `${l.id}:${l.text}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function computeEligibilityHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function computeProfileHash(profile: {
  patient_id: string;
  diagnosis: { primary: string };
  biomarkers: { name: string; status: string }[];
  prior_therapies: { name: string }[];
}): string {
  const payload = JSON.stringify({
    patient_id: profile.patient_id,
    diagnosis: profile.diagnosis.primary,
    biomarkers: profile.biomarkers.map((b) => `${b.name}:${b.status}`).sort(),
    therapies: profile.prior_therapies.map((t) => t.name).sort(),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
