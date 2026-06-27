-- Cohort routing cache per trial + patient profile

CREATE TABLE IF NOT EXISTS public.lumen_trial_cohort_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nct_id text NOT NULL,
  profile_hash text NOT NULL,
  cohort_key text NOT NULL,
  cohort_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nct_id, profile_hash)
);

CREATE INDEX IF NOT EXISTS idx_lumen_cohort_cache_nct
  ON public.lumen_trial_cohort_cache(nct_id, profile_hash);

ALTER TABLE public.lumen_trial_cohort_cache ENABLE ROW LEVEL SECURITY;
