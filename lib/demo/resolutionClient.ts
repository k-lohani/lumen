import resolutionFixture from "@/data/demo/resolution-after-echo.json";
import type { TrialVerdict } from "../types";

/** Client-safe resolution simulate (no fs). */
export function applyEchoResolution(verdicts: TrialVerdict[]): TrialVerdict[] {
  const fixture = resolutionFixture as { trial_id: string; verdict: TrialVerdict };
  return verdicts.map((v) =>
    v.trial_id === fixture.trial_id ? { ...fixture.verdict } : v
  );
}
