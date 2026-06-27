import { readFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { runPipeline } from "../lib/pipeline/index";
import type { RawChart, Verdict } from "../lib/types";

config({ path: join(process.cwd(), ".env") });

const PINNED_EXPECTED: Record<string, Verdict> = {
  NCT07070232: "CONDITIONALLY_ELIGIBLE",
  NCT06348927: "EXCLUDED",
  NCT07174388: "ELIGIBLE",
};

async function assertPinned(chart: RawChart) {
  const { verdicts } = await runPipeline(chart, {
    pinnedMode: true,
    useGoldenProfile: true,
  });
  let failed = 0;

  for (const [trialId, expected] of Object.entries(PINNED_EXPECTED)) {
    const v = verdicts.find((t) => t.trial_id === trialId);
    if (!v) {
      console.error(`FAIL: missing verdict for ${trialId}`);
      failed++;
      continue;
    }
    if (v.verdict !== expected) {
      console.error(
        `FAIL: ${trialId} expected ${expected}, got ${v.verdict}`
      );
      failed++;
    } else {
      console.log(`OK: ${trialId} = ${expected}`);
    }
  }

  const trialA = verdicts.find((t) => t.trial_id === "NCT07070232");
  if (trialA) {
    const unknowns = trialA.criteria.filter((c) => c.state === "UNKNOWN");
    if (unknowns.length !== 1) {
      console.error(
        `FAIL: Trial A should have exactly 1 UNKNOWN, got ${unknowns.length}`
      );
      failed++;
    } else if (!/LVEF|echo/i.test(unknowns[0].criterion.text)) {
      console.error(`FAIL: Trial A UNKNOWN should be LVEF/echo criterion`);
      failed++;
    } else {
      console.log(`OK: Trial A has single LVEF UNKNOWN`);
    }
  }

  return failed;
}

async function assertDiscovery(chart: RawChart) {
  let failed = 0;
  const { verdicts, discovery } = await runPipeline(chart, {
    useGoldenProfile: true,
    skipDiscoveryCache: true,
  });

  if (discovery.discovered_trials < 1) {
    console.error("FAIL: discovery returned zero trials");
    failed++;
  } else {
    console.log(`OK: discovered ${discovery.discovered_trials} trials`);
  }

  if (verdicts.length < 1) {
    console.error("FAIL: no verdicts returned");
    failed++;
  } else {
    console.log(`OK: ${verdicts.length} verdict(s) generated`);
  }

  console.log(
    `Search: ${discovery.search_summary.condition} · ${discovery.search_summary.terms.join(", ") || "no terms"}`
  );

  return failed;
}

async function main() {
  const mode = process.argv.includes("--pinned")
    ? "pinned"
    : process.argv.includes("--discovery")
      ? "discovery"
      : "pinned";

  const chart = JSON.parse(
    readFileSync(join(process.cwd(), "data/charts/hero.json"), "utf-8")
  ) as RawChart;

  const failed =
    mode === "discovery"
      ? await assertDiscovery(chart)
      : await assertPinned(chart);

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${mode} assertions passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
