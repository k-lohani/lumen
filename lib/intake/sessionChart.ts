import type { RawChart } from "../types";

const SESSION_KEY = "lumen:session-chart";

export function saveSessionChart(chart: RawChart): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(chart));
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

export function clearSessionChart(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
}
