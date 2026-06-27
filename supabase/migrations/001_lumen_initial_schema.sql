-- Lumen clinical trial matching schema (lumen_ prefix to coexist in shared projects)

CREATE TABLE IF NOT EXISTS public.lumen_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  mrn text UNIQUE NOT NULL,
  display_name text NOT NULL,
  primary_diagnosis text NOT NULL,
  date_of_birth date NOT NULL,
  sex text NOT NULL CHECK (sex IN ('F', 'M', 'OTHER')),
  chart_synced_at timestamptz NOT NULL DEFAULT now(),
  source_system text NOT NULL DEFAULT 'Epic Clarity',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lumen_chart_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.lumen_patients(id) ON DELETE CASCADE,
  line_id text NOT NULL,
  section text NOT NULL,
  text text NOT NULL,
  document_type text NOT NULL DEFAULT 'Progress Note',
  recorded_at date NOT NULL,
  UNIQUE (patient_id, line_id)
);

CREATE INDEX IF NOT EXISTS idx_lumen_chart_lines_patient ON public.lumen_chart_lines(patient_id);

CREATE TABLE IF NOT EXISTS public.lumen_trials (
  nct_id text PRIMARY KEY,
  title text NOT NULL,
  phase text,
  status text NOT NULL DEFAULT 'UNKNOWN',
  eligibility_text text NOT NULL DEFAULT '',
  relevant_cohort text NOT NULL,
  cohort_label text NOT NULL,
  registry_updated_at date,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lumen_trial_criteria_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nct_id text NOT NULL REFERENCES public.lumen_trials(nct_id) ON DELETE CASCADE,
  cohort_key text UNIQUE NOT NULL,
  criteria jsonb NOT NULL,
  eligibility_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lumen_criteria_cohort_key ON public.lumen_trial_criteria_cache(cohort_key);

CREATE TABLE IF NOT EXISTS public.lumen_match_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.lumen_patients(id) ON DELETE CASCADE,
  chart_hash text NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.lumen_match_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.lumen_match_runs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.lumen_patients(id) ON DELETE CASCADE,
  chart_hash text NOT NULL,
  verdicts jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lumen_match_verdicts_patient ON public.lumen_match_verdicts(patient_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lumen_match_verdicts_hash ON public.lumen_match_verdicts(patient_id, chart_hash);

ALTER TABLE public.lumen_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumen_chart_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumen_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumen_trial_criteria_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumen_match_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumen_match_verdicts ENABLE ROW LEVEL SECURITY;
