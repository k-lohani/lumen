import { loadResolutionAfterEcho } from "./loadFixtures";
import type { TrialVerdict } from "../types";

/** Swap one-step-away trial with post-echo fixture (demo / client simulate). */
export function applyEchoResolution(verdicts: TrialVerdict[]): TrialVerdict[] {
  const fixture = loadResolutionAfterEcho();
  return verdicts.map((v) =>
    v.trial_id === fixture.trial_id ? { ...fixture.verdict } : v
  );
}
