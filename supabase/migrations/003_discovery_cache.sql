-- Discovery cache: CT.gov search results per patient profile

CREATE TABLE IF NOT EXISTS public.lumen_discovery_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.lumen_patients(id) ON DELETE CASCADE,
  profile_hash text NOT NULL,
  search_params jsonb NOT NULL,
  nct_ids text[] NOT NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, profile_hash)
);

CREATE INDEX IF NOT EXISTS idx_lumen_discovery_cache_patient
  ON public.lumen_discovery_cache(patient_id, discovered_at DESC);

ALTER TABLE public.lumen_discovery_cache ENABLE ROW LEVEL SECURITY;
