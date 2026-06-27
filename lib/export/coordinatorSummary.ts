import type { GeoFilter, TrialVerdict } from "../types";

export interface CoordinatorSummaryInput {
  displayName: string;
  mrn: string;
  matchedAt: string;
  searchSummary?: {
    condition: string;
    terms: string[];
    geo?: GeoFilter;
  };
  verdicts: TrialVerdict[];
}

export function buildCoordinatorSummary(input: CoordinatorSummaryInput): string {
  const lines: string[] = [];
  const { displayName, mrn, matchedAt, searchSummary, verdicts } = input;

  lines.push(`# Pre-screen summary — ${displayName} (${mrn})`);
  lines.push(`Generated: ${new Date(matchedAt).toLocaleString()}`);
  lines.push("");

  if (searchSummary) {
    lines.push("## Discovery");
    lines.push(`- Condition: ${searchSummary.condition}`);
    if (searchSummary.terms.length) {
      lines.push(`- Terms: ${searchSummary.terms.join(", ")}`);
    }
    if (searchSummary.geo) {
      lines.push(
        `- Location: within ${searchSummary.geo.radiusMi} mi of ${searchSummary.geo.label}`
      );
    }
    lines.push("");
  }

  const eligible = verdicts.filter((v) => v.verdict === "ELIGIBLE");
  const conditional = verdicts.filter(
    (v) => v.verdict === "CONDITIONALLY_ELIGIBLE"
  );
  const excluded = verdicts.filter((v) => v.verdict === "EXCLUDED");

  lines.push("## Verdict counts");
  lines.push(`- Eligible now: ${eligible.length}`);
  lines.push(`- One step away: ${conditional.length}`);
  lines.push(`- Excluded: ${excluded.length}`);
  lines.push("");

  for (const v of [...eligible, ...conditional, ...excluded]) {
    lines.push(`## ${v.trial_id} — ${v.verdict.replace(/_/g, " ")}`);
    lines.push(v.trial_title);
    if (v.recruiting_sites_nearby != null) {
      lines.push(
        `- Recruiting sites nearby: ${v.recruiting_sites_nearby}`
      );
    }
    if (v.actionable_gap) {
      lines.push(
        `- Gap: ${v.actionable_gap.missing_item} — ${v.actionable_gap.action}`
      );
    }
    const cited = v.criteria.filter((c) => c.evidence_span).slice(0, 3);
    for (const c of cited) {
      lines.push(
        `- [${c.state}] ${c.criterion.text.slice(0, 80)}… → "${c.evidence_span}" (${c.evidence_line_id})`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "Decision support only — coordinator review and PI confirmation required."
  );

  return lines.join("\n");
}
