import { syncAllTrialsFromRegistry } from "../lib/db/trials";

async function main() {
  console.log("Syncing trials from ClinicalTrials.gov...");
  const trials = await syncAllTrialsFromRegistry();
  for (const t of trials) {
    console.log(`${t.nct_id}: ${t.status} — ${t.title.slice(0, 60)}…`);
  }
  console.log(`\nSynced ${trials.length} trials.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
