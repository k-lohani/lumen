// Lumen data contracts — merged build + tech specs

export interface ChartLine {
  id: string;
  section: string;
  text: string;
}

export interface RawChart {
  patient_id: string;
  display_name: string;
  lines: ChartLine[];
}

export interface PatientProfile {
  patient_id: string;
  demographics: { age: number; sex: "M" | "F" | "OTHER" };
  diagnosis: {
    primary: string;
    histology?: string;
    stage?: string;
    source_line_ids: string[];
  };
  biomarkers: { name: string; status: string; source_line_ids: string[] }[];
  prior_therapies: {
    name: string;
    class?: string;
    line?: number;
    source_line_ids: string[];
  }[];
  performance_status?: {
    scale: "ECOG" | "KPS";
    value: number;
    source_line_ids: string[];
  };
  labs_measurements: {
    name: string;
    value?: string;
    unit?: string;
    date?: string;
    source_line_ids: string[];
  }[];
}

export type CriterionType = "INCLUSION" | "EXCLUSION";
export type CriterionCategory =
  | "DEMOGRAPHIC"
  | "DIAGNOSIS"
  | "BIOMARKER"
  | "PRIOR_THERAPY"
  | "PERFORMANCE_STATUS"
  | "LAB_MEASUREMENT"
  | "OTHER";

export interface Criterion {
  criterion_id: string;
  trial_id: string;
  cohort_scope: "general" | string;
  type: CriterionType;
  category: CriterionCategory;
  text: string;
  source_offset?: [number, number];
}

export type CriterionState = "MET" | "NOT_MET" | "UNKNOWN";

export interface ActionableGap {
  missing_item: string;
  action: string;
  threshold?: string;
  cost_tier: "CHEAP" | "MODERATE" | "EXPENSIVE";
}

export interface CriterionResult {
  criterion: Criterion;
  state: CriterionState;
  evidence_line_id: string | null;
  evidence_span: string | null;
  faithfulness: { substring_ok: boolean; entailment_ok?: boolean };
  rationale: string;
  resolving_action?: ActionableGap;
}

export type Verdict = "ELIGIBLE" | "CONDITIONALLY_ELIGIBLE" | "EXCLUDED";

export interface GeoFilter {
  lat: number;
  lng: number;
  radiusMi: number;
  label: string;
}

export interface TrialVerdict {
  trial_id: string;
  trial_title: string;
  phase?: string;
  trial_status: string;
  matched_cohort: string;
  cohort_label: string;
  registry_synced_at: string;
  verdict: Verdict;
  criteria: CriterionResult[];
  actionable_gap: ActionableGap | null;
  reachability_rank: number;
  recruiting_sites_nearby?: number;
  nearest_sites?: { facility: string; city: string; state?: string }[];
}

export interface PinnedTrial {
  nct_id: string;
  relevant_cohort: string;
  cohort_label: string;
  pinned_at: string;
  api_response: Record<string, unknown>;
}

export interface IngestedTrial {
  nct_id: string;
  title: string;
  phase?: string;
  status: string;
  eligibility_text: string;
  relevant_cohort: string;
  cohort_label: string;
  registry_synced_at: string;
}

export interface LabeledPair {
  patient_id: string;
  trial_id: string;
  criterion_id: string;
  criterion_text: string;
  type: CriterionType;
  gold_state: CriterionState;
  citing_chart_line?: string;
}

export interface EvalMetrics {
  lumen: {
    accuracy: number;
    unknown_recall: number;
    unknown_precision: number;
    faithfulness_rate: number;
    exclusion_detection_rate: number;
  };
  baseline_naive: {
    accuracy: number;
    unknown_recall: number;
    unknown_precision: number;
    faithfulness_rate: number;
    exclusion_detection_rate: number;
  };
  baseline_grounded?: {
    accuracy: number;
    unknown_recall: number;
    unknown_precision: number;
    faithfulness_rate: number;
    exclusion_detection_rate: number;
  };
  total_pairs: number;
  generated_at: string;
}

export interface PatientPackage {
  slug: string;
  mrn: string;
  display_name: string;
  primary_diagnosis: string;
  demographics: { date_of_birth: string; sex: string };
  chart_synced_at: string;
  source_system: string;
  line_count: number;
  lines: {
    line_id: string;
    section: string;
    text: string;
    document_type: string;
    recorded_at: string;
  }[];
  profile?: PatientProfile;
}

export interface SearchSummary {
  condition: string;
  terms: string[];
  status: string[];
  phases: string[];
  geo?: GeoFilter;
}

export interface DiscoveryMetadata {
  discovered_trials: number;
  search_summary: SearchSummary;
  nct_ids: string[];
  from_cache: boolean;
}

export interface PipelineOptions {
  useGoldenProfile?: boolean;
  skipMatchCache?: boolean;
  skipDiscoveryCache?: boolean;
  pinnedMode?: boolean;
  patientUuid?: string | null;
  geoFilter?: GeoFilter;
}

export interface PipelineResult {
  verdicts: TrialVerdict[];
  profile: PatientProfile;
  discovery: DiscoveryMetadata;
}
