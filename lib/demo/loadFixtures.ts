import { readFileSync } from "fs";
import { join } from "path";
import type { PipelineProgressEvent, TrialVerdict } from "../types";

export interface NaiveResult {
  criterion_id: string;
  trial_id: string;
  state: "MET" | "NOT_MET";
  rationale: string;
}

export interface GoldenMatchFixture {
  patientSlug: string;
  mrn: string;
  display_name: string;
  matched_at: string;
  patient_story?: string;
  discovered_trials?: number;
  search_summary?: {
    condition: string;
    terms: string[];
    status: string[];
    phases: string[];
    geo?: { lat: number; lng: number; radiusMi: number; label: string };
  };
  verdicts: TrialVerdict[];
  demo_trail?: PipelineProgressEvent[];
}

export interface NaiveBaselineFixture {
  highlightCriterionId: string;
  results: NaiveResult[];
}

export interface ResolutionFixture {
  trial_id: string;
  verdict: TrialVerdict;
}

function readJson<T>(name: string): T {
  const path = join(process.cwd(), "data", "demo", name);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function loadGoldenMatch(): GoldenMatchFixture {
  return readJson<GoldenMatchFixture>("golden-match.json");
}

export function loadNaiveBaseline(): NaiveBaselineFixture {
  return readJson<NaiveBaselineFixture>("naive-baseline.json");
}

export function loadResolutionAfterEcho(): ResolutionFixture {
  return readJson<ResolutionFixture>("resolution-after-echo.json");
}
