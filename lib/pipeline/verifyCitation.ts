import type { ChartLine } from "../types";

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
      faithfulness: { substring_ok: false },
      rationale: `${result.rationale} (Evidence could not be verified — downgraded to UNKNOWN.)`,
    };
  }

  return {
    ...result,
    faithfulness: { substring_ok: true },
  };
}
