import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { cheapModel, hasApiKey, structured } from "../llm";
import type { PatientProfile, RawChart } from "../types";

const PatientProfileSchema = z.object({
  patient_id: z.string(),
  demographics: z.object({
    age: z.number(),
    sex: z.enum(["M", "F", "OTHER"]),
  }),
  diagnosis: z.object({
    primary: z.string(),
    histology: z.string().optional(),
    stage: z.string().optional(),
    source_line_ids: z.array(z.string()),
  }),
  biomarkers: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      source_line_ids: z.array(z.string()),
    })
  ),
  prior_therapies: z.array(
    z.object({
      name: z.string(),
      class: z.string().optional(),
      line: z.number().optional(),
      source_line_ids: z.array(z.string()),
    })
  ),
  performance_status: z
    .object({
      scale: z.enum(["ECOG", "KPS"]),
      value: z.number(),
      source_line_ids: z.array(z.string()),
    })
    .optional(),
  labs_measurements: z.array(
    z.object({
      name: z.string(),
      value: z.string().optional(),
      unit: z.string().optional(),
      date: z.string().optional(),
      source_line_ids: z.array(z.string()),
    })
  ),
});

function loadGoldenProfile(patientId: string): PatientProfile {
  const path = join(
    process.cwd(),
    "data",
    "charts",
    `${patientId}.profile.golden.json`
  );
  return JSON.parse(readFileSync(path, "utf-8")) as PatientProfile;
}

function validateLineIds(profile: PatientProfile, chart: RawChart): PatientProfile {
  const validIds = new Set(chart.lines.map((l) => l.id));

  const filterIds = (ids: string[]) => ids.filter((id) => validIds.has(id));

  return {
    ...profile,
    diagnosis: {
      ...profile.diagnosis,
      source_line_ids: filterIds(profile.diagnosis.source_line_ids),
    },
    biomarkers: profile.biomarkers.map((b) => ({
      ...b,
      source_line_ids: filterIds(b.source_line_ids),
    })),
    prior_therapies: profile.prior_therapies.map((t) => ({
      ...t,
      source_line_ids: filterIds(t.source_line_ids),
    })),
    performance_status: profile.performance_status
      ? {
          ...profile.performance_status,
          source_line_ids: filterIds(profile.performance_status.source_line_ids),
        }
      : undefined,
    labs_measurements: profile.labs_measurements.map((l) => ({
      ...l,
      source_line_ids: filterIds(l.source_line_ids),
    })),
  };
}

const EXTRACT_SYSTEM = `You are a clinical chart extractor. Build a structured PatientProfile from chart lines.
Rules:
- Every field must cite source_line_ids from the provided chart lines only.
- Do NOT infer values not explicitly stated. If LVEF, echo, or biopsy details are absent, omit them.
- Silence is signal: missing data must not appear in the profile.`;

export async function extractProfile(
  chart: RawChart,
  opts?: { useGoldenProfile?: boolean }
): Promise<PatientProfile> {
  if (opts?.useGoldenProfile || !hasApiKey()) {
    try {
      const golden = loadGoldenProfile(chart.patient_id);
      return validateLineIds({ ...golden, patient_id: chart.patient_id }, chart);
    } catch {
      if (!hasApiKey()) {
        throw new Error(
          `No ANTHROPIC_API_KEY and no golden profile for ${chart.patient_id}`
        );
      }
    }
  }

  const linesBlock = chart.lines
    .map((l) => `[${l.id} | ${l.section}] ${l.text}`)
    .join("\n");

  const profile = await structured({
    model: cheapModel(),
    system: EXTRACT_SYSTEM,
    user: `Extract PatientProfile for patient_id="${chart.patient_id}".\n\nCHART:\n${linesBlock}`,
    toolName: "patient_profile",
    schema: PatientProfileSchema,
    stage: "extractProfile",
  });

  return validateLineIds(profile, chart);
}
