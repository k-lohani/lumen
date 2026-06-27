import { readFileSync } from "fs";
import { join } from "path";
import type {
  PatientProfile,
  SearchSummary,
  TrialVerdict,
} from "../types";

const DEMO_DIR = join(process.cwd(), "data", "demo");

function readJson<T>(filename: string): T {
  const path = join(DEMO_DIR, filename);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export interface GoldenMatchFixture {
  patientSlug: string;
  mrn: string;
  display_name: string;
  matched_at: string;
  profile: PatientProfile;
  patient_story: string;
  discovered_trials: number;
  search_summary: SearchSummary;
  verdicts: TrialVerdict[];
  demo: true;
}

export interface GoldenProfileFixture {
  profile: PatientProfile;
  chart_hash: string;
  patient_story: string;
}

export interface NaiveBaselineFixture {
  patient_id: string;
  highlight_criterion_id: string;
  results: {
    criterion_id: string;
    trial_id: string;
    state: "MET" | "NOT_MET";
    rationale: string;
  }[];
}

export interface ResolutionAfterEchoFixture {
  trial_id: string;
  verdict: TrialVerdict;
  injected_line: {
    id: string;
    section: string;
    text: string;
  };
}

export interface PasteSampleFixture extends GoldenMatchFixture {
  paste_preview: string;
}

export interface DiscoveryPreviewFixture {
  trials: {
    nct_id: string;
    title: string;
    phase?: string;
    status: string;
    recruiting_sites_nearby?: number;
  }[];
  discovery: {
    search_summary: SearchSummary;
    discovered_at: string;
  };
}

export function loadGoldenMatch(slug = "hero"): GoldenMatchFixture {
  if (slug === "paste-demo") {
    return readJson<PasteSampleFixture>("paste-sample.json");
  }
  return readJson<GoldenMatchFixture>("golden-match.json");
}

export function loadGoldenProfile(): GoldenProfileFixture {
  return readJson<GoldenProfileFixture>("golden-profile.json");
}

export function loadNaiveBaseline(): NaiveBaselineFixture {
  return readJson<NaiveBaselineFixture>("naive-baseline.json");
}

export function loadResolutionAfterEcho(): ResolutionAfterEchoFixture {
  return readJson<ResolutionAfterEchoFixture>("resolution-after-echo.json");
}

export function loadDiscoveryPreview(slug = "hero"): DiscoveryPreviewFixture {
  const match = loadGoldenMatch(slug);
  return {
    trials: match.verdicts.map((v) => ({
      nct_id: v.trial_id,
      title: v.trial_title,
      phase: v.phase,
      status: v.trial_status,
      recruiting_sites_nearby: v.recruiting_sites_nearby,
    })),
    discovery: {
      search_summary: match.search_summary,
      discovered_at: match.matched_at,
    },
  };
}

