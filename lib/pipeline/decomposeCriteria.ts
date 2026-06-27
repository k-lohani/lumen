import { z } from "zod";
import { computeEligibilityHash } from "../chartHash";
import {
  getCachedCriteria as getDbCachedCriteria,
  setCachedCriteria,
} from "../db/criteriaCache";
import { cheapModel, hasApiKey, isAnthropicUnavailableError, structured } from "../llm";
import type { Criterion, IngestedTrial } from "../types";

const CriterionSchema = z.object({
  criterion_id: z.string(),
  trial_id: z.string(),
  cohort_scope: z.string(),
  type: z.enum(["INCLUSION", "EXCLUSION"]),
  category: z.enum([
    "DEMOGRAPHIC",
    "DIAGNOSIS",
    "BIOMARKER",
    "PRIOR_THERAPY",
    "PERFORMANCE_STATUS",
    "LAB_MEASUREMENT",
    "OTHER",
  ]),
  text: z.string(),
  source_offset: z.tuple([z.number(), z.number()]).optional(),
});

const DecomposeSchema = z.object({
  criteria: z.array(CriterionSchema),
});

const DECOMPOSE_SYSTEM = `You decompose clinical trial eligibility text into atomic criteria.
Rules:
- Split compound criteria into individually checkable items.
- Tag each as INCLUSION or EXCLUSION and assign a category.
- Preserve numeric thresholds and temporal windows verbatim in text.
- Only include criteria for the specified cohort plus shared "general" criteria.
- Do not include criteria from other cohorts.`;

function fallbackCriteria(trial: IngestedTrial, cohort: string): Criterion[] {
  return [
    {
      criterion_id: `${trial.nct_id}:${cohort}:manual`,
      trial_id: trial.nct_id,
      cohort_scope: cohort,
      type: "INCLUSION",
      category: "OTHER",
      text: `Review full eligibility for ${trial.nct_id} (LLM decompose unavailable).`,
    },
  ];
}

export async function decomposeCriteria(
  trial: IngestedTrial,
  cohort: string
): Promise<Criterion[]> {
  const cached = await getDbCachedCriteria(trial.nct_id, cohort);
  if (cached) return cached;

  if (!hasApiKey()) {
    throw new Error(
      `No stored criteria for ${trial.nct_id}:${cohort} and no ANTHROPIC_API_KEY`
    );
  }

  try {
    const result = await structured({
      model: cheapModel(),
      system: DECOMPOSE_SYSTEM,
      user: `Trial: ${trial.nct_id}
Cohort: ${cohort} (${trial.cohort_label})

ELIGIBILITY TEXT:
${trial.eligibility_text}

Return criteria scoped to cohort "${cohort}" and "general" only.`,
      toolName: "decomposed_criteria",
      schema: DecomposeSchema,
      stage: "decomposeCriteria",
    });

    const criteria = result.criteria.map((c) => ({
      ...c,
      trial_id: trial.nct_id,
    }));

    const hash = computeEligibilityHash(trial.eligibility_text);
    await setCachedCriteria(trial.nct_id, cohort, criteria, hash);

    return criteria;
  } catch (error) {
    if (isAnthropicUnavailableError(error)) {
      console.warn(
        `Criteria decompose LLM failed for ${trial.nct_id}, using fallback criterion`
      );
      return fallbackCriteria(trial, cohort);
    }
    throw error;
  }
}
