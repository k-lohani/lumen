import { z } from "zod";
import { cheapModel, hasApiKey, structured } from "../llm";
import type { IngestedTrial, PatientProfile } from "../types";
import { computeProfileHash } from "../chartHash";
import { getCachedCohort, saveCachedCohort } from "../db/cohortCache";
import { TRIAL_COHORT_META } from "../clinicaltrials/client";

const CohortSchema = z.object({
  cohort_key: z.string(),
  cohort_label: z.string(),
});

const COHORT_SYSTEM = `You route a patient to the correct trial cohort based on eligibility text and patient profile.
If eligibility has no distinct cohort arms, return cohort_key "general" and a short label.
Otherwise pick the single best-matching cohort key referenced in the eligibility text.`;

function hasCohortStructure(eligibilityText: string): boolean {
  return /cohort\s+\d|arm\s+[a-z0-9]/i.test(eligibilityText);
}

export async function selectCohort(
  trial: IngestedTrial,
  profile: PatientProfile,
  opts?: { pinnedMode?: boolean }
): Promise<{ cohort: string; label: string }> {
  if (opts?.pinnedMode && TRIAL_COHORT_META[trial.nct_id]) {
    const meta = TRIAL_COHORT_META[trial.nct_id];
    return { cohort: meta.relevant_cohort, label: meta.cohort_label };
  }

  const profileHash = computeProfileHash(profile);
  if (!opts?.pinnedMode) {
    const cached = await getCachedCohort(trial.nct_id, profileHash);
    if (cached) return cached;
  }

  if (!hasCohortStructure(trial.eligibility_text)) {
    const result = {
      cohort: "general",
      label: "General eligibility",
    };
    await saveCachedCohort(trial.nct_id, profileHash, result.cohort, result.label);
    return result;
  }

  if (!hasApiKey()) {
    return {
      cohort: trial.relevant_cohort || "general",
      label: trial.cohort_label || "General eligibility",
    };
  }

  const biomarkers = profile.biomarkers
    .map((b) => `${b.name} (${b.status})`)
    .join(", ");
  const therapies = profile.prior_therapies
    .map((t) => t.name)
    .join(", ");

  const result = await structured({
    model: cheapModel(),
    system: COHORT_SYSTEM,
    user: `TRIAL: ${trial.title} (${trial.nct_id})

ELIGIBILITY:
${trial.eligibility_text.slice(0, 6000)}

PATIENT:
Diagnosis: ${profile.diagnosis.primary}${profile.diagnosis.stage ? `, ${profile.diagnosis.stage}` : ""}
Biomarkers: ${biomarkers || "none documented"}
Prior therapies: ${therapies || "none documented"}`,
    toolName: "cohort_route",
    schema: CohortSchema,
    stage: "selectCohort",
  });

  const routed = {
    cohort: result.cohort_key,
    label: result.cohort_label,
  };
  await saveCachedCohort(trial.nct_id, profileHash, routed.cohort, routed.label);
  return routed;
}
