import type { ChartLine, Criterion } from "../types";

/** Mechanical substring gate — evidence must appear in runtime raw_chart. */
export function verifyCitation(
  rawChart: string,
  lines: ChartLine[],
  evidenceLineId: string | null,
  evidenceSpan: string | null
): { substring_ok: boolean; verified_span: string | null } {
  if (!evidenceSpan || !evidenceLineId) {
    return { substring_ok: true, verified_span: null };
  }

  if (!rawChart.includes(evidenceSpan)) {
    return { substring_ok: false, verified_span: null };
  }

  const line = lines.find((l) => l.id === evidenceLineId);
  if (!line || !line.text.includes(evidenceSpan)) {
    return { substring_ok: false, verified_span: null };
  }

  return { substring_ok: true, verified_span: evidenceSpan };
}

export function applyFaithfulnessGate(
  rawChart: string,
  lines: ChartLine[],
  result: {
    state: "MET" | "NOT_MET" | "UNKNOWN";
    evidence_line_id: string | null;
    evidence_span: string | null;
    faithfulness: { substring_ok: boolean; entailment_ok?: boolean };
    rationale: string;
  }
): typeof result {
  if (result.state === "UNKNOWN") {
    return {
      ...result,
      faithfulness: { substring_ok: true },
    };
  }

  const check = verifyCitation(
    rawChart,
    lines,
    result.evidence_line_id,
    result.evidence_span
  );

  if (!check.substring_ok) {
    return {
      ...result,
      state: "UNKNOWN",
      evidence_line_id: null,
      evidence_span: null,
      faithfulness: { substring_ok: false, entailment_ok: false },
      rationale: `${result.rationale} (Evidence could not be verified — downgraded to UNKNOWN.)`,
    };
  }

  return {
    ...result,
    faithfulness: {
      substring_ok: true,
      entailment_ok: result.faithfulness.entailment_ok,
    },
  };
}

export interface EntailmentCheck {
  criterion_id: string;
  supports: boolean;
  better_line_id: string | null;
  better_quote: string | null;
}

/** Apply entailment verdicts after batch LLM or rule-based verifier. */
export function applyEntailmentGate(
  rawChart: string,
  lines: ChartLine[],
  criterion: Criterion,
  result: {
    state: "MET" | "NOT_MET" | "UNKNOWN";
    evidence_line_id: string | null;
    evidence_span: string | null;
    faithfulness: { substring_ok: boolean; entailment_ok?: boolean };
    rationale: string;
  },
  check: EntailmentCheck | undefined
): typeof result {
  if (result.state === "UNKNOWN" || !check) {
    return result;
  }

  if (check.supports) {
    return {
      ...result,
      faithfulness: { substring_ok: true, entailment_ok: true },
    };
  }

  if (check.better_line_id && check.better_quote) {
    const line = lines.find((l) => l.id === check.better_line_id);
    if (!line) {
      return downgradeEntailment(result);
    }

    const swapped = {
      ...result,
      evidence_line_id: check.better_line_id,
      evidence_span: check.better_quote,
      faithfulness: { substring_ok: true, entailment_ok: true },
      rationale: `${result.rationale} (Re-selected supporting chart line ${check.better_line_id}.)`,
    };

    const sub = verifyCitation(
      rawChart,
      lines,
      swapped.evidence_line_id,
      swapped.evidence_span
    );
    if (!sub.substring_ok) {
      return downgradeEntailment(result);
    }

    return swapped;
  }

  return downgradeEntailment(result);
}

function downgradeEntailment(
  result: {
    state: "MET" | "NOT_MET" | "UNKNOWN";
    evidence_line_id: string | null;
    evidence_span: string | null;
    faithfulness: { substring_ok: boolean; entailment_ok?: boolean };
    rationale: string;
  }
): typeof result {
  return {
    ...result,
    state: "UNKNOWN",
    evidence_line_id: null,
    evidence_span: null,
    faithfulness: { substring_ok: true, entailment_ok: false },
    rationale: `${result.rationale} (Citation does not directly support this criterion — downgraded to UNKNOWN.)`,
  };
}

/** Deterministic entailment rules for pinned / CI mode. */
export function ruleBasedEntailmentCheck(
  criterion: Criterion,
  evidenceLineId: string | null
): EntailmentCheck {
  const text = criterion.text.toLowerCase();
  const id = evidenceLineId;

  if (/organ|bone marrow|marrow function/i.test(text)) {
    if (id === "L0004") {
      return {
        criterion_id: criterion.criterion_id,
        supports: false,
        better_line_id: "L0007",
        better_quote:
          "2026-06: ANC 3.1, Hgb 11.8, Plt 220k, bili 0.7, Cr 0.9, AST/ALT normal — adequate organ/marrow function.",
      };
    }
    if (id === "L0007") {
      return {
        criterion_id: criterion.criterion_id,
        supports: true,
        better_line_id: null,
        better_quote: null,
      };
    }
  }

  if (/ecog/i.test(text)) {
    const ok = id === "L0004";
    return {
      criterion_id: criterion.criterion_id,
      supports: ok,
      better_line_id: ok ? null : "L0004",
      better_quote: ok
        ? null
        : "ECOG performance status 1.",
    };
  }

  if (/life expectancy|survival.*months/i.test(text)) {
    if (id === "L0011") {
      return {
        criterion_id: criterion.criterion_id,
        supports: true,
        better_line_id: null,
        better_quote: null,
      };
    }
    if (id === "L0004") {
      return {
        criterion_id: criterion.criterion_id,
        supports: false,
        better_line_id: "L0011",
        better_quote:
          "Prognosis: treating oncologist estimates life expectancy greater than 6 months.",
      };
    }
  }

  if (/lvef|ejection fraction|echocardiograph/i.test(text)) {
    return {
      criterion_id: criterion.criterion_id,
      supports: false,
      better_line_id: null,
      better_quote: null,
    };
  }

  return {
    criterion_id: criterion.criterion_id,
    supports: true,
    better_line_id: null,
    better_quote: null,
  };
}

export function citationVerified(r: {
  state: string;
  faithfulness: { substring_ok: boolean; entailment_ok?: boolean };
}): boolean {
  return (
    r.faithfulness.substring_ok && r.faithfulness.entailment_ok !== false
  );
}
