export { loadAllTrials, loadPinnedTrials } from "../db/trials";

import { readFileSync } from "fs";
import { join } from "path";
import type { IngestedTrial, PinnedTrial } from "../types";

export function loadPinnedTrial(nctId: string): IngestedTrial {
  const path = join(process.cwd(), "data", "trials", `${nctId}.json`);
  const pinned: PinnedTrial = JSON.parse(readFileSync(path, "utf-8"));
  const ps = pinned.api_response.protocolSection as {
    identificationModule?: { briefTitle?: string };
    statusModule?: {
      overallStatus?: string;
      lastUpdatePostDateStruct?: { date?: string };
    };
    designModule?: { phases?: string[] };
    eligibilityModule?: { eligibilityCriteria?: string };
  };
  const phases = ps.designModule?.phases ?? [];
  const phase = phases.length
    ? phases.map((p) => p.replace("PHASE", "Phase ").trim()).join("/")
    : undefined;

  return {
    nct_id: pinned.nct_id,
    title: ps.identificationModule?.briefTitle ?? nctId,
    phase,
    status: ps.statusModule?.overallStatus ?? "UNKNOWN",
    eligibility_text: ps.eligibilityModule?.eligibilityCriteria ?? "",
    relevant_cohort: pinned.relevant_cohort,
    cohort_label: pinned.cohort_label,
    registry_synced_at: pinned.pinned_at,
    protocol_last_updated:
      ps.statusModule?.lastUpdatePostDateStruct?.date ?? pinned.pinned_at,
  };
}
