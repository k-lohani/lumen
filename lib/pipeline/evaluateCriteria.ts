import { z } from "zod";
import { resolveAction } from "../actions/actionMap";
import { deriveRawChart } from "../chart";
import { evalModel, hasApiKey, isAnthropicUnavailableError, structured } from "../llm";
import type {
  ChartLine,
  Criterion,
  CriterionResult,
  PatientProfile,
  PipelineProgressEvent,
  RawChart,
} from "../types";
import { applyFaithfulnessGate, applyEntailmentGate, ruleBasedEntailmentCheck, type EntailmentCheck } from "./verifyCitation";

const BATCH_SIZE = 10;

const P0_RULES = `Decision rules (P0-5):
- MET: chart contains evidence that affirmatively satisfies the criterion → return a verbatim span.
- NOT_MET: chart contains evidence that contradicts the criterion → return the contradicting span. Reserve for explicit contradictions only.
- UNKNOWN: chart is silent or insufficient → no span. Never infer or assume defaults.
- If the chart does not explicitly state the information, return UNKNOWN. Do not infer normal values or typical findings.
- For EXCLUSION criteria: MET means the exclusion condition is TRUE for this patient (patient should be excluded).`;

const EvalItemSchema = z.object({
  criterion_id: z.string(),
  state: z.enum(["MET", "NOT_MET", "UNKNOWN"]),
  evidence_line_id: z.string().nullable(),
  evidence_quote: z.string().nullable(),
  rationale: z.string(),
});

const BatchEvalSchema = z.object({
  evaluations: z.array(EvalItemSchema),
});

const EntailmentItemSchema = z.object({
  criterion_id: z.string(),
  supports: z.boolean(),
  better_line_id: z.string().nullable(),
  better_quote: z.string().nullable(),
});

const BatchEntailmentSchema = z.object({
  checks: z.array(EntailmentItemSchema),
});

const ENTAILMENT_SYSTEM = `You verify whether a cited chart line DIRECTLY supports the criterion verdict (MET or NOT_MET).

Rules:
- supports=true only when the quoted line directly establishes the criterion — not loosely associated context.
- ECOG performance status does NOT support organ/marrow function, life expectancy, or lab adequacy unless the criterion is about ECOG.
- If supports=false but another chart line directly supports the verdict, set better_line_id and a VERBATIM better_quote from that line.
- If no line directly supports the verdict, set better_line_id and better_quote to null.
- better_line_id must be one of the provided line ids or null.`;

const EVAL_SYSTEM = `You are a clinical trial eligibility adjudicator. Evaluate each criterion using ONLY the supplied chart lines.
${P0_RULES}
- evidence_line_id must be exactly one of the provided line ids (or null if UNKNOWN).
- evidence_quote must be copied VERBATIM from that line. Do not paraphrase.
- rationale: one sentence, plain language.`;

interface RawEval {
  criterion_id: string;
  state: "MET" | "NOT_MET" | "UNKNOWN";
  evidence_line_id: string | null;
  evidence_span: string | null;
  rationale: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function findLine(
  lines: ChartLine[],
  patterns: RegExp[]
): { line: ChartLine; span: string } | null {
  for (const line of lines) {
    for (const pattern of patterns) {
      if (pattern.test(line.text)) {
        return { line, span: line.text };
      }
    }
  }
  return null;
}

function chartMentions(lines: ChartLine[], patterns: RegExp[]): boolean {
  return lines.some((l) => patterns.some((p) => p.test(l.text)));
}

/** Deterministic rule-based fallback when no API key. */
function evaluateRuleBased(
  criterion: Criterion,
  lines: ChartLine[],
  profile: PatientProfile
): RawEval {
  const text = criterion.text.toLowerCase();
  const isExclusion = criterion.type === "EXCLUSION";

  const egfrMatch = findLine(lines, [
    /EGFR exon 19/i,
    /EGFR.*(19del|L858R|sensitiz)/i,
  ]);
  const osimertinibMatch = findLine(lines, [/osimertinib/i, /EGFR TKI/i]);
  const ecogMatch = findLine(lines, [/ECOG\s*(performance\s*status\s*)?[01]/i]);
  const measurableMatch = findLine(lines, [/measurable.*RECIST|RECIST.*measurable/i]);
  const organMatch = findLine(lines, [
    /adequate organ|organ\/marrow|ANC|hemoglobin|platelet/i,
  ]);
  const ildMatch = findLine(lines, [/interstitial lung disease/i]);
  const ageMatch = findLine(lines, [/\b\d{2}-year-old|\bage\s*\d+/i]);
  const nsclcMatch = findLine(lines, [
    /Stage IV lung|metastatic.*NSCLC|lung adenocarcinoma/i,
  ]);
  const consentMatch = findLine(lines, [/informed consent|willing to sign/i]);
  const brainMatch = findLine(lines, [/brain MRI|intracranial/i]);
  const lvefPresent = chartMentions(lines, [
    /LVEF|ejection fraction|echocardiograph/i,
  ]);

  const met = (
    line: ChartLine,
    span: string,
    rationale: string
  ): RawEval => ({
    criterion_id: criterion.criterion_id,
    state: "MET",
    evidence_line_id: line.id,
    evidence_span: span,
    rationale,
  });

  const notMet = (
    line: ChartLine,
    span: string,
    rationale: string
  ): RawEval => ({
    criterion_id: criterion.criterion_id,
    state: "NOT_MET",
    evidence_line_id: line.id,
    evidence_span: span,
    rationale,
  });

  const unknown = (rationale: string): RawEval => ({
    criterion_id: criterion.criterion_id,
    state: "UNKNOWN",
    evidence_line_id: null,
    evidence_span: null,
    rationale,
  });

  if (/lvef|ejection fraction|echocardiograph|muga/i.test(text)) {
    if (lvefPresent) {
      const echo = findLine(lines, [/LVEF|ejection fraction|echocardiograph/i])!;
      const low = /LVEF\s*[<≤]\s*50|ejection fraction\s*[<≤]\s*50/i.test(
        echo.line.text
      );
      if (isExclusion) {
        return low
          ? met(echo.line, echo.span, "Documented LVEF below 50% — exclusion applies.")
          : notMet(echo.line, echo.span, "LVEF ≥50% on file — exclusion does not apply.");
      }
    }
    return unknown("Chart contains no echocardiogram or LVEF measurement.");
  }

  if (/egfr|sensitiz/i.test(text) && /mutation|19del|l858r/i.test(text)) {
    if (egfrMatch) {
      return met(
        egfrMatch.line,
        egfrMatch.span,
        "EGFR sensitizing mutation documented on NGS."
      );
    }
    return unknown("No EGFR mutation documented in chart.");
  }

  if (/without systemic treatment|treatment.?na[iï]ve|no prior systemic/i.test(text)) {
    if (osimertinibMatch) {
      return notMet(
        osimertinibMatch.line,
        osimertinibMatch.span,
        "Patient received prior systemic therapy — not treatment-naïve."
      );
    }
    return unknown("Chart does not state prior systemic treatment status.");
  }

  if (/prior systemic therapy|prior.*systemic treatment/i.test(text) && isExclusion) {
    if (osimertinibMatch) {
      return met(
        osimertinibMatch.line,
        osimertinibMatch.span,
        "Prior osimertinib constitutes prior systemic therapy — exclusion fires."
      );
    }
    return unknown("No prior systemic therapy documented.");
  }

  if (/third.?generation|3rd.?gen|osimertinib.*progression|progression.*osimertinib/i.test(text)) {
    if (osimertinibMatch && /progress/i.test(osimertinibMatch.line.text)) {
      return met(
        osimertinibMatch.line,
        osimertinibMatch.span,
        "Third-generation EGFR TKI with documented progression."
      );
    }
    return unknown("No third-generation TKI with progression documented.");
  }

  if (/second line or later.*osimertinib|osimertinib monotherapy/i.test(text)) {
    if (osimertinibMatch) {
      return met(
        osimertinibMatch.line,
        osimertinibMatch.span,
        "Prior osimertinib monotherapy with progression supports cohort 9."
      );
    }
    return unknown("No prior osimertinib therapy documented.");
  }

  if (/ecog/i.test(text)) {
    if (ecogMatch) {
      const ecogVal = profile.performance_status?.value;
      const ok = ecogVal !== undefined ? ecogVal <= 1 : /ECOG\s*(performance\s*status\s*)?1/i.test(ecogMatch.line.text);
      if (ok) {
        return met(ecogMatch.line, ecogMatch.span, "ECOG ≤1 documented.");
      }
      return notMet(ecogMatch.line, ecogMatch.span, "ECOG exceeds allowed limit.");
    }
    return unknown("No ECOG performance status in chart.");
  }

  if (/measurable|recist/i.test(text)) {
    if (measurableMatch) {
      return met(
        measurableMatch.line,
        measurableMatch.span,
        "Measurable disease per RECIST documented."
      );
    }
    return unknown("No measurable disease documented.");
  }

  if (/organ|bone marrow|marrow function/i.test(text)) {
    if (organMatch) {
      return met(
        organMatch.line,
        organMatch.span,
        "Adequate organ and marrow function documented."
      );
    }
    return unknown("No organ/marrow function labs in chart.");
  }

  if (/interstitial lung|ild|pneumonitis/i.test(text) && isExclusion) {
    if (ildMatch && /no history|without.*ild|no.*interstitial/i.test(ildMatch.line.text)) {
      return notMet(
        ildMatch.line,
        ildMatch.span,
        "No ILD history — exclusion does not apply."
      );
    }
    if (ildMatch && !/no history|without/i.test(ildMatch.line.text)) {
      return met(ildMatch.line, ildMatch.span, "ILD history documented — exclusion applies.");
    }
    return unknown("Chart silent on interstitial lung disease history.");
  }

  if (/18 years|age.*18|greater than 18/i.test(text)) {
    if (ageMatch || profile.demographics.age >= 18) {
      const line = ageMatch?.line ?? lines[0];
      const span = ageMatch?.span ?? line.text;
      return met(line, span, `Patient is ${profile.demographics.age} years old.`);
    }
    return unknown("Patient age not documented.");
  }

  if (/metastatic nsclc|locally advanced.*nsclc|patholog/i.test(text)) {
    if (nsclcMatch) {
      return met(
        nsclcMatch.line,
        nsclcMatch.span,
        "Metastatic NSCLC confirmed in chart."
      );
    }
    return unknown("No pathologic NSCLC confirmation in chart.");
  }

  if (/life expectancy|survival.*weeks|survival.*months/i.test(text)) {
    const prognosisMatch = findLine(lines, [
      /life expectancy|prognosis|survival.*months/i,
    ]);
    if (prognosisMatch) {
      return met(
        prognosisMatch.line,
        prognosisMatch.span,
        "Life expectancy explicitly documented by treating oncologist."
      );
    }
    return unknown("Life expectancy not explicitly documented.");
  }

  if (/informed consent|understand and sign/i.test(text)) {
    if (consentMatch) {
      return met(
        consentMatch.line,
        consentMatch.span,
        "Patient able and willing to provide informed consent."
      );
    }
    return unknown("Consent capacity not documented.");
  }

  if (/investigational agent|clinical trial/i.test(text) && isExclusion) {
    if (osimertinibMatch) {
      return notMet(
        osimertinibMatch.line,
        osimertinibMatch.span,
        "On FDA-approved osimertinib — not documented as on an investigational agent."
      );
    }
    return unknown("Investigational trial participation not documented.");
  }

  if (/another malignancy|other malignancy/i.test(text) && isExclusion) {
    const comorbid = findLine(lines, [/comorbid|no history|chemotherapy/i]);
    if (comorbid) {
      return notMet(
        comorbid.line,
        comorbid.span,
        "No active systemic therapy for another malignancy documented."
      );
    }
    return unknown("Other malignancy status not documented.");
  }

  if (/curative intent/i.test(text) && isExclusion) {
    if (nsclcMatch) {
      return notMet(
        nsclcMatch.line,
        nsclcMatch.span,
        "Stage IV disease — not eligible for curative-intent therapy."
      );
    }
    return unknown("Curative-intent eligibility not assessable from chart.");
  }

  if (/brain|intracranial/i.test(text)) {
    if (brainMatch) {
      return met(brainMatch.line, brainMatch.span, "Brain imaging documented.");
    }
    return unknown("No brain imaging in chart.");
  }

  return unknown(`Chart does not explicitly address: ${criterion.text.slice(0, 80)}…`);
}

async function evaluateBatchLlm(
  criteria: Criterion[],
  lines: ChartLine[],
  profile: PatientProfile
): Promise<RawEval[]> {
  const linesBlock = lines
    .map((l) => `[${l.id} | ${l.section}] ${l.text}`)
    .join("\n");

  const criteriaBlock = criteria
    .map(
      (c) =>
        `- id=${c.criterion_id} type=${c.type} category=${c.category}: "${c.text}"`
    )
    .join("\n");

  const profileSummary = JSON.stringify(
    {
      demographics: profile.demographics,
      diagnosis: profile.diagnosis,
      biomarkers: profile.biomarkers,
      prior_therapies: profile.prior_therapies,
      performance_status: profile.performance_status,
      labs_measurements: profile.labs_measurements,
    },
    null,
    2
  );

  const result = await structured({
    model: evalModel(),
    system: EVAL_SYSTEM,
    user: `Evaluate each criterion below.

PATIENT PROFILE (for context only — cite chart lines, not profile):
${profileSummary}

CHART LINES:
${linesBlock}

CRITERIA:
${criteriaBlock}`,
    toolName: "batch_evaluate",
    schema: BatchEvalSchema,
    stage: "evaluateCriteria",
  });

  return result.evaluations.map((e) => ({
    criterion_id: e.criterion_id,
    state: e.state,
    evidence_line_id: e.evidence_line_id,
    evidence_span: e.evidence_quote,
    rationale: e.rationale,
  }));
}

function entailmentEnabled(): boolean {
  if (process.env.LUMEN_ENTAILMENT_CHECK === "false") return false;
  return hasApiKey();
}

async function verifyEntailmentBatchLlm(
  results: CriterionResult[],
  lines: ChartLine[]
): Promise<Map<string, EntailmentCheck>> {
  const toCheck = results.filter((r) => r.state !== "UNKNOWN");
  if (toCheck.length === 0) return new Map();

  const linesBlock = lines
    .map((l) => `[${l.id} | ${l.section}] ${l.text}`)
    .join("\n");

  const checksBlock = toCheck
    .map(
      (r) =>
        `- id=${r.criterion.criterion_id} type=${r.criterion.type} verdict=${r.state}: "${r.criterion.text}"
  cited_line=${r.evidence_line_id ?? "null"} quote="${r.evidence_span ?? ""}"`
    )
    .join("\n");

  const result = await structured({
    model: evalModel(),
    system: ENTAILMENT_SYSTEM,
    user: `Verify each citation below.

CHART LINES:
${linesBlock}

CITATIONS TO VERIFY:
${checksBlock}`,
    toolName: "entailment_verify",
    schema: BatchEntailmentSchema,
    stage: "entailmentVerify",
  });

  return new Map(result.checks.map((c) => [c.criterion_id, c]));
}

function verifyEntailmentRuleBased(
  results: CriterionResult[]
): Map<string, EntailmentCheck> {
  const map = new Map<string, EntailmentCheck>();
  for (const r of results) {
    if (r.state === "UNKNOWN") continue;
    map.set(
      r.criterion.criterion_id,
      ruleBasedEntailmentCheck(r.criterion, r.evidence_line_id)
    );
  }
  return map;
}

function toCriterionResult(
  criterion: Criterion,
  raw: RawEval,
  rawChart: string,
  lines: ChartLine[],
  entailmentCheck?: EntailmentCheck
): CriterionResult {
  const gated = applyFaithfulnessGate(rawChart, lines, {
    state: raw.state,
    evidence_line_id: raw.evidence_line_id,
    evidence_span: raw.evidence_span,
    faithfulness: { substring_ok: true },
    rationale: raw.rationale,
  });

  const entailed = applyEntailmentGate(
    rawChart,
    lines,
    criterion,
    gated,
    entailmentCheck
  );

  const result: CriterionResult = {
    criterion,
    state: entailed.state,
    evidence_line_id: entailed.evidence_line_id,
    evidence_span: entailed.evidence_span,
    faithfulness: entailed.faithfulness,
    rationale: entailed.rationale,
  };

  if (result.state === "UNKNOWN") {
    result.resolving_action = resolveAction(
      criterion.text,
      criterion.category
    );
  }

  return result;
}

export async function evaluateCriteria(
  criteria: Criterion[],
  chart: RawChart,
  profile: PatientProfile,
  opts?: {
    useRuleBased?: boolean;
    onProgress?: (event: PipelineProgressEvent) => void;
    nct_id?: string;
  }
): Promise<CriterionResult[]> {
  const rawChart = deriveRawChart(chart.lines);
  const batches = chunk(criteria, BATCH_SIZE);
  const rawById = new Map<string, RawEval>();
  const useRuleBased = opts?.useRuleBased || !hasApiKey();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (opts?.nct_id && opts?.onProgress) {
      opts.onProgress({
        type: "trial_step",
        nct_id: opts.nct_id,
        step: "evaluate",
        meta: {
          batch: i + 1,
          batch_total: batches.length,
          batch_size: batch.length,
        },
      });
    }

    if (!useRuleBased) {
      try {
        const llmResults = await evaluateBatchLlm(batch, chart.lines, profile);
        for (const r of llmResults) rawById.set(r.criterion_id, r);
      } catch (error) {
        if (isAnthropicUnavailableError(error)) {
          for (const c of batch) {
            rawById.set(
              c.criterion_id,
              evaluateRuleBased(c, chart.lines, profile)
            );
          }
        } else {
          throw error;
        }
      }
    } else {
      for (const c of batch) {
        rawById.set(c.criterion_id, evaluateRuleBased(c, chart.lines, profile));
      }
    }
  }

  const substringResults = criteria.map((c) => {
    const raw = rawById.get(c.criterion_id) ?? {
      criterion_id: c.criterion_id,
      state: "UNKNOWN" as const,
      evidence_line_id: null,
      evidence_span: null,
      rationale: "No evaluation produced for this criterion.",
    };
    return toCriterionResult(c, raw, rawChart, chart.lines);
  });

  const runEntailment = useRuleBased || entailmentEnabled();
  if (!runEntailment) {
    return substringResults;
  }

  if (opts?.nct_id && opts?.onProgress && !useRuleBased) {
    opts.onProgress({
      type: "trial_step",
      nct_id: opts.nct_id,
      step: "entailment",
      meta: { criteria_count: criteria.length },
    });
  }

  let usedRuleBased = useRuleBased;
  let entailmentMap: Map<string, EntailmentCheck>;
  if (usedRuleBased) {
    entailmentMap = verifyEntailmentRuleBased(substringResults);
  } else {
    try {
      entailmentMap = await verifyEntailmentBatchLlm(substringResults, chart.lines);
    } catch (error) {
      if (isAnthropicUnavailableError(error)) {
        usedRuleBased = true;
        entailmentMap = verifyEntailmentRuleBased(substringResults);
      } else {
        throw error;
      }
    }
  }

  return criteria.map((c) => {
    const raw = rawById.get(c.criterion_id)!;
    const check = entailmentMap.get(c.criterion_id);
    return toCriterionResult(c, raw, rawChart, chart.lines, check);
  });
}
