# Lumen

**Clinical trial pre-screening copilot** for research coordinators and research nurses.

Lumen reads de-identified chart notes, discovers recruiting trials on ClinicalTrials.gov, routes patients to the correct cohort, and evaluates every inclusion/exclusion criterion with chart-line citations. Coordinators get a reviewable pre-screen — not a black-box match score — with actionable gaps when data is missing and a PI-ready summary to hand off.

Built for a **3-minute hackathon demo** with an offline fixture path (sub-second, no live API calls) and a full **live pipeline** for Q&A.

---

## What you see in the app

### Home (`/`)

Two intake paths:

**Demo patients** (recommended for presentations)
- Select **Margaret Chen** (hero patient — EGFR ex19, post-osimertinib, ECOG 1)
- Set patient site: **New York, NY** with radius 25 / 50 / 100 mi
- Review chart excerpt and discovery preview sidebar
- Click **Run pre-screen**

**Paste chart**
- Paste a de-identified oncology note (or use the placeholder sample)
- **Parse chart** → line preview
- **Extract profile** → structured preview (diagnosis, biomarkers, prior therapy, ECOG)
- **Run pre-screen** (demo uses pre-cached output)

### Results (`/results`)

- **Patient story** and plain-language verdict summary
- Three buckets: **Eligible now** · **One step away** · **Not eligible**
- Per-trial cards with cohort label, CT.gov link, **recruiting sites nearby** badge
- Expandable criteria rows: MET / NOT_MET / **Needs verification** with chart-line citations
- **Compare to naive AI** (demo) — side-by-side forced-guess baseline vs grounded Lumen; highlights LVEF fabrication row
- **Simulate result added** (demo) — one-step-away trial flips to Eligible now after echo is added
- **Copy pre-screen summary** — markdown artifact for PI handoff
- **Print** and decision-support boundary footer

---

## 3-minute demo script

With `DEMO_MODE=1` (see [Quick start](#quick-start)):

| Time | Beat |
|------|------|
| 0:00 | Open app — coordinator pain: hours pre-screening one patient; few enroll |
| 0:30 | Margaret Chen → NYC 50 mi → **Run pre-screen** |
| 1:00 | Results: 1 eligible · 1 one-step-away · 1 excluded — cited criteria + site badges |
| 1:40 | Toggle **Compare to naive AI** — naive fabricates LVEF; Lumen says UNKNOWN |
| 2:20 | **Simulate result added** on NCT07070232 → **Eligible now** (2 eligible trials) |
| 2:45 | **Copy pre-screen summary** — PI handoff + decision-support line |

Paste intake: brief mention or Q&A; demo path uses `paste-demo` fixture.

---

## Quick start

```bash
cd lumen
cp .env.example .env
npm install
npm run dev
```

Open **http://localhost:3005**.

For hackathon / presentation, keep these in `.env`:

```bash
DEMO_MODE=1
NEXT_PUBLIC_DEMO_MODE=1
```

Results load from committed fixtures in `data/demo/` — no live CT.gov or uncached LLM on the scripted path.

To regenerate fixtures after pipeline changes:

```bash
npm run generate-demo-fixtures
```

For live mode (Q&A), set `DEMO_MODE=0`, add `ANTHROPIC_API_KEY`, and optionally Supabase credentials.

---

## How the pipeline works

```
Chart → extractProfile → discoverTrials (CT.gov)
  → selectCohort → decomposeCriteria → evaluateCriteria
  → faithfulness gate → aggregateVerdict → rank → UI
```

| Stage | What it does |
|-------|----------------|
| **extractProfile** | Haiku LLM → structured diagnosis, biomarkers, prior therapies, ECOG |
| **discoverTrials** | CT.gov v2 search by condition + biomarkers; geo filter optional; rank + top-K cap |
| **selectCohort** | Route patient to correct trial arm |
| **decomposeCriteria** | Split eligibility text into atomic criteria |
| **evaluateCriteria** | Sonnet → MET / NOT_MET / UNKNOWN per criterion with evidence spans |
| **faithfulness gate** | Citations must appear verbatim in chart; failures → UNKNOWN |
| **aggregateVerdict** | Eligible now / One step away / Not eligible + cheapest actionable gap |
| **rank** | Reachability score orders trials for coordinator review |

---

## Operating modes

| Mode | When | Behavior |
|------|------|----------|
| **Demo fixtures** | `DEMO_MODE=1`, `demo: true`, or `?demo=1` | Serves `data/demo/*.json`; sub-second responses |
| **Live discovery** | Default without demo flag | CT.gov + Claude; Supabase caches (24h) when configured |
| **Pinned regression** | `pinnedMode: true`, CLI scripts | Fixed 3 trials; rule-based eval; deterministic |

### Hero patient (Margaret Chen) — pinned verdicts

| Trial | NCT | Verdict |
|-------|-----|---------|
| BNT326/BNT327 | NCT07070232 | One step away (LVEF/echo UNKNOWN) |
| Sunvozertinib 1L | NCT06348927 | Not eligible (prior osimertinib) |
| External Control Arm | NCT07174388 | Eligible now |

---

## API

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/patients` | List patients |
| `GET` | `/api/patients/[slug]` | Patient package + chart lines |
| `POST` | `/api/match` | Run pre-screen (`patientSlug`, `demo`, `chart`, `geoFilter`, `pinnedMode`) |
| `POST` | `/api/profile` | Extract profile from pasted chart |
| `GET` | `/api/trials?patientSlug=` | Discovery preview |
| `POST` | `/api/trials` | Force fresh discovery (live) |
| `GET` | `/api/demo/[fixture]` | Demo JSON (`naive-baseline`, `resolution-after-echo`, `golden-profile`) |

---

## Environment variables

See [`.env.example`](.env.example).

| Variable | Purpose |
|----------|---------|
| `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` | Offline demo fixtures (hackathon default) |
| `ANTHROPIC_API_KEY` | Required for live pipeline |
| `ANTHROPIC_MODEL_EVAL` | Criterion evaluation (default Sonnet) |
| `ANTHROPIC_MODEL_CHEAP` | Profile + routing (default Haiku) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Persistence + caching (server only) |
| `LUMEN_TRIAL_NCTS` | Pinned regression trial list |
| `LUMEN_MAX_DISCOVERED_TRIALS` | Discovery cap (default 10) |
| `LUMEN_CTGOV_STATUS` | e.g. `RECRUITING` |
| `LUMEN_CTGOV_PHASES` | e.g. `PHASE2,PHASE3,PHASE4` |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port **3005** |
| `npm run build` | Production build |
| `npm run generate-demo-fixtures` | Regenerate `data/demo/` from pipeline + cache |
| `npm run assert-verdicts -- --pinned` | 3-trial regression (no API key) |
| `npm run assert-verdicts -- --discovery` | Live CT.gov smoke test |
| `npm run test-pipeline` | Refresh `data/cache/hero-verdicts.json` |
| `npm run eval` | 42-pair eval harness |
| `npm run seed-supabase` | Seed Supabase from fixtures |
| `npm run fetch-trials` | Download pinned NCT JSON |
| `npm run sync-trials` | Sync trials to Supabase |

---

## Patient fixtures

| Slug | Patient | Notes |
|------|---------|-------|
| `hero` | Margaret Chen | **Recommended demo** — EGFR ex19, post-osimertinib, no echo on file |
| `variant-echo-on-file` | Margaret Chen + echo | LVEF 58%; used for resolution-after-echo fixture |
| `variant-prior-tki` | James Park | Prior TKI exclusion patterns |

Charts: `data/charts/`. Golden profiles: `*.profile.golden.json`. Demo output: `data/demo/`.

---

## Project layout

```
app/                    Pages + API routes
components/             TrialCard, CriterionRow, resolution loop, naive compare, …
lib/pipeline/           Matching pipeline
lib/clinicaltrials/     CT.gov client, discovery, geo ranking
lib/demo/               Demo mode + fixture loaders
lib/intake/             Paste chart parser + sessionStorage
lib/export/             Coordinator summary markdown
data/demo/              Committed hackathon fixtures
data/charts/            Patient fixtures
data/trials/            Pinned trial JSON + criteria cache
supabase/migrations/    Schema (001–004)
eval/                   42-pair eval + baselines
scripts/                CLI utilities
```

---

## Supabase (optional)

For live caching across sessions:

1. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. Apply migrations `001`–`004` in `supabase/migrations/`
3. Run `npm run seed-supabase`

---

## Evaluation

- 42 labeled criterion pairs in `data/eval/labeled-pairs.json`
- `npm run eval` compares Lumen vs naive and grounded baselines
- Latest metrics in `data/eval/results.json`

---

## Deploy (Vercel)

```bash
vercel link
vercel env add ANTHROPIC_API_KEY
vercel env add DEMO_MODE          # 1 for demo deploy, 0 for live
vercel env add NEXT_PUBLIC_DEMO_MODE
vercel deploy
```

`vercel.json` sets `maxDuration: 300` on `/api/match` for live runs.

---

## Limitations

Research prototype with synthetic de-identified charts. **Decision support only** — coordinators review and the PI confirms; Lumen never enrolls patients or issues final rulings. LLM outputs and CT.gov discovery require human verification. Not for clinical use without validation.
