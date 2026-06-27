-- Cache extracted patient profiles keyed by chart content

ALTER TABLE public.lumen_patients
  ADD COLUMN IF NOT EXISTS profile_json jsonb,
  ADD COLUMN IF NOT EXISTS profile_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_chart_hash text;
