# Lumen

Clinical trial eligibility matching with per-criterion evidence, chart citations, and actionable gaps for unknown criteria. Lumen extracts a structured patient profile from clinical documentation, discovers recruiting trials on ClinicalTrials.gov, routes each patient to the correct cohort, and evaluates every inclusion/exclusion criterion with line-level citations.

## Features

- **Patient packages** — de-identified chart lines with document metadata, loaded from Supabase or local fixtures
- **Dynamic trial discovery** — profile-driven ClinicalTrials.gov v2 search with relevance ranking and top-K cap
- **Criterion-level adjudication** — MET / NOT_MET / UNKNOWN states with verbatim evidence spans
- **Faithfulness gate** — citations must match source chart text
- **Actionable gaps** — resolvable missing data surfaced for conditionally eligible trials
- **Reachability ranking** — trials ordered by proximity to enrollment
- **Dual operating modes** — live CT.gov discovery (default) and pinned 3-trial regression

## How it works

1. Extract a structured profile from the patient chart (diagnosis, biomarkers, prior therapies, performance status)
2. Search ClinicalTrials.gov for recruiting trials matching the profile
3. Route the patient to the correct trial cohort when eligibility defines multiple arms
4. Decompose eligibility text into atomic criteria and evaluate each against chart lines
5. Aggregate verdicts: **Eligible now**, **One step away**, or **Not eligible**

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript |
| Database | Supabase Postgres (server-side service role) |
| LLM | Anthropic Claude — Sonnet for evaluation, Haiku for extraction/routing |
| External API | ClinicalTrials.gov API v2 |

## Quick start

```bash
cd lumen
cp .env.example .env
# Add ANTHROPIC_API_KEY (required for discovery mode)
# Optionally add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for persistence
npm install
npm run dev
```

Open **http://localhost:3005**, select a patient, and click **Run eligibility match**.

Without Supabase, patients and pinned trial fixtures load from `data/charts/` and `data/trials/`. Every match runs live against ClinicalTrials.gov.

## Supabase setup (recommended)

Persistent caching (profiles, discovery results, match verdicts, decomposed criteria, cohort routing) requires Supabase.

1. Create a Supabase project and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`
2. Apply migrations in order from `supabase/migrations/`:
   - `001_lumen_initial_schema.sql` — patients, charts, trials, match cache
   - `002_patient_profile_cache.sql` — extracted profile cache
   - `003_discovery_cache.sql` — CT.gov discovery cache
   - `004_cohort_cache.sql` — cohort routing cache
3. Seed demo data:

```bash
npm run seed-supabase
```

Optional: sync pinned trial registry data from ClinicalTrials.gov:

```bash
npm run sync-trials
```

## Patient fixtures

| Slug | Patient | Scenario |
|------|---------|----------|
| `hero` | Margaret Chen | EGFR+ NSCLC, post-osimertinib progression |
| `variant-echo-on-file` | Margaret Chen (variant) | Echo/LVEF documentation on file |
| `variant-prior-tki` | James Park | Prior TKI therapy, exclusion patterns |

Golden profiles for regression live in `data/charts/*.profile.golden.json`.

## Operating modes

| Mode | Trigger | Trials evaluated |
|------|---------|------------------|
| **Discovery** (default) | UI, `POST /api/match` | CT.gov search + optional `LUMEN_PINNED_NCTS` |
| **Pinned regression** | `pinnedMode: true`, `assert-verdicts`, `test-pipeline` | Fixed 3-trial demo spine |

### Pinned regression expected verdicts

| Trial | NCT | Verdict |
|-------|-----|---------|
| A — BNT326/BNT327 | NCT07070232 | CONDITIONALLY_ELIGIBLE (LVEF/echo UNKNOWN) |
| B — Sunvozertinib 1L | NCT06348927 | EXCLUDED (prior osimertinib) |
| C — External Control Arm | NCT07174388 | ELIGIBLE |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (discovery) | LLM for profile, cohort, criteria, evaluation |
| `ANTHROPIC_MODEL_EVAL` | No | Default `claude-sonnet-4-6` |
| `ANTHROPIC_MODEL_CHEAP` | No | Default `claude-haiku-4-5` |
| `SUPABASE_URL` | Recommended | Server-side database URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Never expose to the browser |
| `LUMEN_TRIAL_NCTS` | No | Pinned regression NCT list |
| `LUMEN_PINNED_NCTS` | No | Always merge into discovery results |
| `LUMEN_MAX_DISCOVERED_TRIALS` | No | Default `10` |
| `LUMEN_CTGOV_STATUS` | No | Default `RECRUITING` |
| `LUMEN_CTGOV_PHASES` | No | Default `PHASE2,PHASE3,PHASE4` |
| `LUMEN_ENTAILMENT_CHECK` | No | Optional entailment re-check (not yet wired) |

See `.env.example` for the full template.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port **3005** |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run fetch-trials` | Download pinned NCT JSON to `data/trials/` |
| `npm run sync-trials` | Sync pinned trials from CT.gov into Supabase |
| `npm run seed-supabase` | Seed patients, charts, and trials |
| `npm run test-pipeline` | Run pinned pipeline + refresh `data/cache/hero-verdicts.json` |
| `npm run assert-verdicts` | Regression checks (`--pinned` or `--discovery`) |
| `npm run eval` | Eval harness → `data/eval/results.json` (42 gold pairs) |

### Regression testing

```bash
# Pinned 3-trial regression (rule-based eval, no API key required)
npm run assert-verdicts -- --pinned

# Live CT.gov discovery smoke test (requires ANTHROPIC_API_KEY)
npm run assert-verdicts -- --discovery
```

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/patients` | List patient summaries |
| `GET` | `/api/patients/[slug]` | Full patient package with chart lines |
| `POST` | `/api/match` | Run eligibility pipeline (`{ patientSlug, pinnedMode? }`) |
| `GET` | `/api/trials?patientSlug=` | Last discovery preview for a patient |
| `POST` | `/api/trials` | Force fresh CT.gov discovery (`{ patientSlug }`) |

Match verdicts are cached in Supabase for 24 hours when configured. Cache is transparent to the UI.

## Architecture

```
Patient chart → extractProfile → discoverTrials (CT.gov)
  → selectCohort → decomposeCriteria → evaluateCriteria
  → faithfulness gate → aggregateVerdict → rank → UI
```

Key directories:

```
app/                  Next.js pages and API routes
components/           TrialCard, CriterionRow, VerdictBadge, …
lib/pipeline/         Matching pipeline stages
lib/clinicaltrials/   CT.gov client, discovery, search, ranking
lib/db/               Supabase accessors with file fallbacks
data/charts/          Patient fixtures and golden profiles
data/trials/          Pinned trial JSON and criteria cache
supabase/migrations/  Database schema (001–004)
eval/                 Eval harness and baselines
scripts/              CLI utilities
```

## Deploy (Vercel)

```bash
vercel link
vercel env add ANTHROPIC_API_KEY
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel deploy
```

`vercel.json` sets `maxDuration: 300` on `/api/match` for live discovery and evaluation runs. Apply Supabase migrations and run `seed-supabase` against your production database before first use.

## Evaluation

- 42 labeled criterion pairs in `data/eval/labeled-pairs.json`
- `npm run eval` compares Lumen against naive and grounded baselines
- The `/eval` web route is disabled; use the CLI harness

## Limitations

Research prototype using synthetic de-identified charts. Not intended for clinical decision-making. CT.gov discovery is heuristic and capped. LLM outputs require human review.
