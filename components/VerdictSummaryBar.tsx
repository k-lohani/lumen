import type { TrialVerdict } from "@/lib/types";

interface VerdictSummaryBarProps {
  displayName: string;
  verdicts: TrialVerdict[];
}

export function VerdictSummaryBar({
  displayName,
  verdicts,
}: VerdictSummaryBarProps) {
  const eligible = verdicts.filter((v) => v.verdict === "ELIGIBLE").length;
  const conditional = verdicts.filter(
    (v) => v.verdict === "CONDITIONALLY_ELIGIBLE"
  ).length;
  const excluded = verdicts.filter((v) => v.verdict === "EXCLUDED").length;

  const pronoun = displayName.includes("James") ? "he" : "she";

  const parts: string[] = [];
  if (eligible > 0) {
    parts.push(
      `${eligible} trial ${pronoun} qualifies for now`
    );
  }
  if (conditional > 0) {
    parts.push(`${conditional} step away`);
  }
  if (excluded > 0) {
    parts.push(`${excluded} excluded`);
  }

  return (
    <p className="text-sm leading-relaxed text-ink-muted">
      <span className="font-semibold text-ink">Summary:</span>{" "}
      {parts.join(" · ")} — each with chart-line evidence cited below.
    </p>
  );
}
