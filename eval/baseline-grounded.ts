import type { CriterionState, LabeledPair } from "../lib/types";
import { naiveBaselinePredict } from "./baseline";

/** Baseline B: UNKNOWN allowed but ungrounded — guesses on silence. */
export function groundedBaselinePredict(pair: LabeledPair): CriterionState {
  const naive = naiveBaselinePredict(pair);

  const silentPatterns =
    /lvef|echo|pregnancy|hepatitis|hiv|qt|life expectancy|investigational trial/i;
  if (silentPatterns.test(pair.criterion_text)) {
    if (pair.gold_state === "UNKNOWN") return "UNKNOWN";
    if (/lvef|echo/.test(pair.criterion_text) && pair.patient_id === "hero") {
      return "UNKNOWN";
    }
    return naive === "MET" ? "MET" : "UNKNOWN";
  }

  return naive;
}
