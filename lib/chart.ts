import type { ChartLine, RawChart } from "./types";

/** Single source of truth — raw_chart is never stored separately. */
export function deriveRawChart(lines: ChartLine[]): string {
  return lines.map((l) => `[${l.id} | ${l.section}] ${l.text}`).join("\n");
}

export function applyCorruption(
  chart: RawChart,
  corruptLineId?: string
): RawChart {
  if (!corruptLineId) return chart;
  return {
    ...chart,
    lines: chart.lines.map((line) =>
      line.id === corruptLineId
        ? { ...line, text: `${line.text} [CORRUPTED]` }
        : line
    ),
  };
}

export function getLineById(
  lines: ChartLine[],
  id: string | null
): ChartLine | undefined {
  if (!id) return undefined;
  return lines.find((l) => l.id === id);
}
