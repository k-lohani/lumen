# Lumen

**Clinical trial pre-screening copilot** for research coordinators and research nurses.

Lumen reads de-identified chart notes, discovers recruiting trials on ClinicalTrials.gov, routes patients to the correct cohort, and evaluates every inclusion/exclusion criterion with chart-line citations. Coordinators get a reviewable pre-screen — not a black-box match score — with actionable gaps when data is missing and a PI-ready summary to hand off.

---

## Product flow

### Home

1. Select a **patient** from the chart library (or **Import chart** to paste or upload a note)
2. Set **patient site** and search radius for recruiting-site context
3. Review the clinical record excerpt and live trial discovery preview
4. Click **Run pre-screen**

### Results

- Live **agent trail** via SSE from `POST /api/match` (`Accept: text/event-stream`): progress events for profile → CT.gov discovery → per-trial cohort / decompose / evaluate, then a `done` event with verdicts
- Plain-language **verdict summary** (eligible now · one step away · excluded)
- Per-trial cards with cohort label, CT.gov link, recruiting sites nearby, confidence summary
- Expandable criteria: MET / NOT_MET / **Needs verification** with chart-line citations
- **Copy pre-screen summary** and **Print / Save as PDF** for PI handoff
- Decision-support boundary — coordinator review required before any enrollment action

---

## Quick start

```bash
cd lumen
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
npm install
npm run dev
```

Open **http://localhost:3005**.

Pre-screening uses the **live pipeline**: Claude profile extraction, **ClinicalTrials.gov v2 discovery**, and criterion-level evaluation. First run typically takes **1–3 minutes** (fetch up to `LUMEN_CTGOV_FETCH_LIMIT` trials from CT.gov, then evaluate the top `LUMEN_MAX_DISCOVERED_TRIALS`).

For live demos, set `LUMEN_DISABLE_CACHE=1` in `.env` to bypass Supabase profile/discovery/verdict caches.

### Import chart (EHR export)

1. Open **Import chart**, paste or upload a de-identified note
2. Click **Extract profile** (live Claude, ~3–10s)
3. Confirm chart lines, then **Confirm & run pre-screen**
4. Lumen persists the chart to Supabase, searches CT.gov, and returns cited verdicts

---

## How the pipeline works

```
Chart → extractProfile → discoverTrials (ClinicalTrials.gov v2)
  → selectCohort → decomposeCriteria → evaluateCriteria
  → faithfulness + entailment gates → aggregateVerdict → rank → UI
```

| Stage | What it does |
|-------|----------------|
| **extractProfile** | Structured diagnosis, biomarkers, prior therapies, ECOG |
| **discoverTrials** | Live CT.gov v2 search by diagnosis, biomarkers, geo (default) |
| **selectCohort** | Route patient to correct trial arm |
| **decomposeCriteria** | Split eligibility text into atomic criteria |
| **evaluateCriteria** | MET / NOT_MET / UNKNOWN per criterion with evidence spans |
| **entailment gate** | Citations must directly support the criterion |
| **aggregateVerdict** | Eligible now / One step away / Not eligible + actionable gap |

### Golden profiles

Library patients ship `data/charts/{slug}.profile.golden.json`. Used when `LUMEN_LIVE_LLM=0`, when no `ANTHROPIC_API_KEY`, or when live profile extraction fails. Pasted/import charts require live LLM (no golden fallback).

---

## Environment variables

See [`.env.example`](.env.example).

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Required for live profile extraction and criterion evaluation |
| `LUMEN_USE_PINNED_TRIALS` | `1` = pinned local portfolio (regression); **`0` = live CT.gov (default)** |
| `LUMEN_CTGOV_FETCH_LIMIT` | Max trials fetched from CT.gov before ranking (default: **20**) |
| `LUMEN_MAX_DISCOVERED_TRIALS` | Top-ranked trials to evaluate per run (default: **10**) |
| `LUMEN_CTGOV_STATUS` | CT.gov status filter (default: `RECRUITING`) |
| `LUMEN_CTGOV_PHASES` | Phase filter (default: `PHASE2,PHASE3,PHASE4`) |
| `LUMEN_PREFER_FILE_CHARTS` | `1` = use `data/charts/` for library patient line text |
| `LUMEN_LIVE_LLM` | `1` = Claude profile + criterion eval (default when API key set); `0` = golden + rule-based |
| `LUMEN_DISABLE_CACHE` | `1` = bypass Supabase profile, discovery, and verdict caches (recommended for demos) |
| `LUMEN_ENTAILMENT_CHECK` | Citation entailment verification (recommended) |
| `SUPABASE_*` | Optional — caches profiles, discovery, verdicts; required for paste persistence |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port **3005** |
| `npm run build` | Production build |
| `npm run assert-verdicts -- --pinned` | Regression on pinned portfolio (no API key) |
| `npm run e2e-smoke` | API smoke test (patients + live discovery + match) |
| `npm run eval` | 42-pair eval harness vs baselines |
| `npm run seed-supabase` | Seed Supabase from chart fixtures |
| `npm run fetch-trials` | Refresh pinned NCT JSON from ClinicalTrials.gov |

---

## Patient charts

| Slug | Patient | Notes |
|------|---------|-------|
| `hero` | Margaret Chen | EGFR ex19, post-osimertinib, ECOG 1 |
| `variant-echo-on-file` | Margaret Chen + echo | LVEF 58% on file |
| `variant-prior-tki` | James Park | Prior TKI exclusion patterns |
| `demo-her2-breast` | Diane Alvarez | De novo metastatic HER2+ HR+ breast cancer, first-line mBC |

**Demo patients:** `hero` (EGFR lung) and `demo-her2-breast` (HER2+ breast) cover distinct disease paths. All four library slugs have golden profiles.

Charts: `data/charts/`. Golden profiles: `data/charts/*.profile.golden.json`. Pinned trials: `data/trials/` (regression only).

---

## API

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/patients` | List patients |
| `GET` | `/api/patients/[slug]` | Patient package + chart lines |
| `POST` | `/api/match` | Run pre-screen; streams SSE when `Accept: text/event-stream` |
| `POST` | `/api/profile` | Extract profile from pasted chart |
| `GET` | `/api/trials?patientSlug=&geo=` | Live CT.gov discovery preview |

---

## Deploy (Vercel)

```bash
vercel link
vercel env add ANTHROPIC_API_KEY
vercel env add LUMEN_USE_PINNED_TRIALS
vercel env add LUMEN_CTGOV_FETCH_LIMIT
vercel env add LUMEN_MAX_DISCOVERED_TRIALS
vercel deploy
```

Set `LUMEN_DISABLE_CACHE=0` in production. `vercel.json` sets `maxDuration: 300` on `/api/match` and `120` on `/api/trials`.

---

## GitHub / release checklist

Before pushing:

1. **Never commit `.env`** — only `.env.example` (already in `.gitignore`)
2. Copy `.env.example` → `.env` locally and add your `ANTHROPIC_API_KEY`
3. Run verification:
   ```bash
   npm run build
   LUMEN_BASE_URL=http://localhost:3005 npm run e2e-smoke
   ```
4. Optional regression (no API key): `npm run assert-verdicts -- --pinned`
5. Stage all changes except secrets; commit and push

Recommended demo env for presentations: `LUMEN_DISABLE_CACHE=1`, `LUMEN_CTGOV_FETCH_LIMIT=20`, `LUMEN_MAX_DISCOVERED_TRIALS=10`.

---

## Limitations

Research prototype with synthetic de-identified charts. **Decision support only** — coordinators review and the PI confirms eligibility; Lumen never enrolls patients or issues final rulings. LLM outputs and trial criteria require human verification. Not for clinical use without validation.
