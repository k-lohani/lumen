import type { PatientProfile, RawChart } from "../types";

const SESSION_KEY = "lumen:session-chart";
const SESSION_PROFILE_KEY = "lumen:session-profile";

export interface SessionChartPayload {
  chart: RawChart;
  profile?: PatientProfile;
}

export function saveSessionChart(
  chart: RawChart,
  profile?: PatientProfile
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(chart));
  if (profile) {
    sessionStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(profile));
  }
}

export function loadSessionChart(): RawChart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RawChart;
  } catch {
    return null;
  }
}

export function loadSessionProfile(): PatientProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PatientProfile;
  } catch {
    return null;
  }
}

export function clearSessionChart(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_PROFILE_KEY);
}
