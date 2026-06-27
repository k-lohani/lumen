import type { Criterion, CriterionResult, PatientProfile } from "../types";

/** Deterministic checks after LLM eval — numeric / logical constraints. */
export function applySymbolicCheck(
  criterion: Criterion,
  profile: PatientProfile,
  result: CriterionResult
): CriterionResult {
  if (result.state === "UNKNOWN") return result;

  const text = criterion.text.toLowerCase();

  if (
    criterion.category === "DEMOGRAPHIC" &&
    /(greater than|≥|>=|at least)\s*18|18\s*years/.test(text)
  ) {
    if (profile.demographics.age < 18 && result.state === "MET") {
      return downgrade(
        result,
        `Symbolic check: documented age ${profile.demographics.age} is below 18.`
      );
    }
  }

  if (/ecog.*(0\s*[-–]\s*1|≤\s*1|<=?\s*1|of 0 or 1)/i.test(text)) {
    const ps = profile.performance_status;
    if (ps?.scale === "ECOG" && ps.value > 1 && result.state === "MET") {
      return downgrade(
        result,
        `Symbolic check: ECOG ${ps.value} exceeds trial limit of 1.`
      );
    }
  }

  if (/lvef\s*[<≤]\s*50|ejection fraction\s*[<≤]\s*50/i.test(text)) {
    const lvef = parseLvefFromProfile(profile);
    if (lvef != null && lvef >= 50 && result.state === "MET") {
      return {
        ...result,
        state: "NOT_MET",
        rationale: `Symbolic check: LVEF ${lvef}% on file — exclusion does not apply.`,
        faithfulness: { ...result.faithfulness, entailment_ok: true },
      };
    }
  }

  return result;
}

function parseLvefFromProfile(profile: PatientProfile): number | null {
  for (const lab of profile.labs_measurements) {
    const m = `${lab.name} ${lab.value ?? ""}`.match(/LVEF\s*(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function downgrade(result: CriterionResult, reason: string): CriterionResult {
  return {
    ...result,
    state: "UNKNOWN",
    evidence_line_id: null,
    evidence_span: null,
    faithfulness: { substring_ok: true, entailment_ok: false },
    rationale: `${result.rationale} (${reason})`,
  };
}
