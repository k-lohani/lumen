import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { computeChartHash } from "../lib/chartHash";
import { runPipeline } from "../lib/pipeline/index";
import type { RawChart, TrialVerdict } from "../lib/types";

config({ path: join(process.cwd(), ".env") });

async function main() {
  const chart = JSON.parse(
    readFileSync(join(process.cwd(), "data/charts/hero.json"), "utf-8")
  ) as RawChart;

  const { verdicts } = await runPipeline(chart, { pinnedMode: true, useGoldenProfile: true });

  for (const t of verdicts) {
    const unknowns = t.criteria
      .filter((c) => c.state === "UNKNOWN")
      .map((c) => c.criterion.criterion_id);
    console.log(`${t.trial_id}: ${t.verdict} (unknowns: ${unknowns.join(", ") || "none"})`);
  }

  const cachePath = join(process.cwd(), "data/cache/hero-verdicts.json");
  let cache: Record<string, unknown> = {};
  try {
    cache = JSON.parse(readFileSync(cachePath, "utf-8"));
  } catch {
    // fresh cache
  }
  cache.hero = {
    chart_hash: computeChartHash(chart),
    generated_at: new Date().toISOString(),
    verdicts,
  };
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  console.log(`\nWrote ${cachePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
