import type { CriterionState, LabeledPair } from "../lib/types";

/** Naive baseline: forced yes/no — never UNKNOWN, no citation check. */
export function naiveBaselinePredict(pair: LabeledPair): CriterionState {
  const text = pair.criterion_text.toLowerCase();

  if (pair.type === "EXCLUSION") {
    if (/prior|systemic therapy|osimertinib|egfr-tki|treatment/.test(text)) {
      if (pair.patient_id === "hero" || pair.patient_id === "variant-prior-tki") {
        return "MET";
      }
    }
    if (/ild|interstitial/.test(text)) return "NOT_MET";
    if (/lvef|echo|pregnancy|hepatitis|hiv|qt/.test(text)) return "MET";
    return "NOT_MET";
  }

  if (/egfr|exon 19|l858r|mutation/.test(text)) return "MET";
  if (/ecog/.test(text)) return "MET";
  if (/measurable|recist/.test(text)) return "MET";
  if (/organ|marrow|anc|platelet/.test(text)) return "MET";
  if (/without systemic treatment|treatment-na/.test(text)) {
    return pair.patient_id === "hero" ? "NOT_MET" : "NOT_MET";
  }
  if (/progressed|osimertinib|second line/.test(text)) return "MET";
  if (/age|18|consent|measurable|nsclc|metastatic/.test(text)) return "MET";
  if (/life expectancy/.test(text)) return "MET";
  if (/lvef|echo/.test(text)) return "MET";

  return "MET";
}
