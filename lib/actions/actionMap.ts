import type { ActionableGap, CriterionCategory, CriterionType } from "../types";

const ACTION_MAP: {
  match: RegExp;
  action: ActionableGap;
}[] = [
  {
    match: /ejection fraction|LVEF|echocardiograph/i,
    action: {
      missing_item: "LVEF (echocardiogram)",
      action: "Order a transthoracic echocardiogram (or MUGA)",
      threshold: "LVEF >= 50%",
      cost_tier: "CHEAP",
    },
  },
  {
    match: /brain\s*MRI|intracranial/i,
    action: {
      missing_item: "Recent brain MRI",
      action: "Order brain MRI",
      cost_tier: "MODERATE",
    },
  },
  {
    match: /organ function|neutrophil|platelet|bilirubin|creatinine|hemoglobin|marrow/i,
    action: {
      missing_item: "Organ/marrow function labs",
      action: "Order a CBC + comprehensive metabolic panel",
      threshold: "Values within protocol range",
      cost_tier: "CHEAP",
    },
  },
  {
    match: /blood pressure|hypertension|SBP|DBP/i,
    action: {
      missing_item: "Blood pressure reading",
      action: "Record a current blood pressure reading",
      threshold: "SBP <= 150 and DBP <= 90",
      cost_tier: "CHEAP",
    },
  },
  {
    match: /(archival|fresh).*(biopsy|tumor tissue)|tissue.*biopsy/i,
    action: {
      missing_item: "Qualifying tumor tissue",
      action:
        "Obtain post-progression tumor tissue (consent to fresh biopsy or locate archival block)",
      cost_tier: "EXPENSIVE",
    },
  },
  {
    match: /.*/,
    action: {
      missing_item: "Missing clinical data",
      action: "Obtain the missing data item noted in this criterion",
      cost_tier: "MODERATE",
    },
  },
];

export function resolveAction(
  criterionText: string,
  category?: CriterionCategory
): ActionableGap {
  const text = `${category ?? ""} ${criterionText}`;
  for (const entry of ACTION_MAP) {
    if (entry.match.test(text)) return entry.action;
  }
  return ACTION_MAP[ACTION_MAP.length - 1].action;
}

export function costWeight(tier: ActionableGap["cost_tier"]): number {
  switch (tier) {
    case "CHEAP":
      return 0.05;
    case "MODERATE":
      return 0.15;
    case "EXPENSIVE":
      return 0.30;
  }
}

export { ACTION_MAP };
