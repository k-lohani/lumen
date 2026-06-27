import type { ChartLine, RawChart } from "../types";

const SECTION_PATTERNS: { pattern: RegExp; section: string }[] = [
  { pattern: /^(molecular|genomic|ngs|biomarker)/i, section: "Molecular" },
  { pattern: /^(treatment|therapy|medication)/i, section: "Treatment" },
  { pattern: /^(performance|ecog|kps)/i, section: "Performance" },
  { pattern: /^(imaging|radiology|mri|ct scan)/i, section: "Imaging" },
  { pattern: /^(labs?|laboratory)/i, section: "Labs" },
  { pattern: /^(cardiac|echo|lvef)/i, section: "Cardiac" },
  { pattern: /^(demographics?|patient)/i, section: "Demographics" },
  { pattern: /^(consent)/i, section: "Consent" },
  { pattern: /^(comorbid)/i, section: "Comorbidities" },
];

function inferSection(line: string): string {
  const headerMatch = line.match(/^([A-Za-z\s]+):\s*(.*)$/);
  if (headerMatch) {
    const label = headerMatch[1].trim();
    for (const { pattern, section } of SECTION_PATTERNS) {
      if (pattern.test(label)) return section;
    }
    return label;
  }
  for (const { pattern, section } of SECTION_PATTERNS) {
    if (pattern.test(line.slice(0, 40))) return section;
  }
  return "Clinical";
}

function stripHeader(line: string): string {
  const headerMatch = line.match(/^([A-Za-z\s]+):\s*(.*)$/);
  return headerMatch ? headerMatch[2].trim() || line : line;
}

export function parsePastedChart(
  raw: string,
  opts: { patientId?: string; displayName?: string } = {}
): RawChart {
  const paragraphs = raw
    .split(/\n\s*\n|\n(?=[A-Za-z][^:]{0,30}:)/)
    .map((p) => p.trim())
    .filter(Boolean);

  const lines: ChartLine[] = paragraphs.map((para, i) => {
    const firstLine = para.split("\n")[0] ?? para;
    const section = inferSection(firstLine);
    const text = stripHeader(para.replace(/\n/g, " ").trim());
    return {
      id: `L${String(i + 1).padStart(4, "0")}`,
      section,
      text,
    };
  });

  return {
    patient_id: opts.patientId ?? "paste-session",
    display_name: opts.displayName ?? "Pasted chart",
    lines,
  };
}

export const DEMO_PASTE_SAMPLE = `Demographics: 58-year-old woman with Stage IV lung adenocarcinoma.

Molecular: NGS — EGFR exon 19 deletion. ALK/ROS1 negative.

Treatment: First-line osimertinib; radiographic progression May 2026.

Performance: ECOG performance status 1.

Imaging: Brain MRI — no intracranial mets. CT chest — measurable RUL lesion 2.4 cm.

Labs: ANC, Hgb, Plt, liver and renal function adequate June 2026.`;
