import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  configuredTrialNcts,
  fetchStudies,
  TRIAL_COHORT_META,
} from "../lib/clinicaltrials/client";
import { isSupabaseConfigured } from "../lib/supabase/server";
import { upsertTrialFromCTGov } from "../lib/db/trials";

const TRIALS_DIR = join(process.cwd(), "data", "trials");

async function main() {
  if (!existsSync(TRIALS_DIR)) mkdirSync(TRIALS_DIR, { recursive: true });

  const ncts = configuredTrialNcts();
  console.log(`Fetching ${ncts.length} studies from ClinicalTrials.gov...`);
  const studies = await fetchStudies(ncts);

  for (const study of studies) {
    const meta = TRIAL_COHORT_META[study.nctId];
    if (!meta) {
      console.warn(`No cohort meta for ${study.nctId}, skipping`);
      continue;
    }

    const rawPath = join(TRIALS_DIR, `${study.nctId}_raw.json`);
    writeFileSync(rawPath, JSON.stringify(study.raw, null, 2));

    const pinned = {
      nct_id: study.nctId,
      relevant_cohort: meta.relevant_cohort,
      cohort_label: meta.cohort_label,
      pinned_at: study.registryUpdatedAt ?? new Date().toISOString().slice(0, 10),
      api_response: study.raw,
    };
    const outPath = join(TRIALS_DIR, `${study.nctId}.json`);
    writeFileSync(outPath, JSON.stringify(pinned, null, 2));
    console.log(`Wrote ${outPath}`);

    if (isSupabaseConfigured()) {
      await upsertTrialFromCTGov(study);
      console.log(`  Upserted to Supabase`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
