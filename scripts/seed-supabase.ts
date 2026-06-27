import { readFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { computeEligibilityHash } from "../lib/chartHash";
import type { Criterion, RawChart } from "../lib/types";
import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase/server";
import { TRIAL_COHORT_META } from "../lib/clinicaltrials/client";

config({ path: join(process.cwd(), ".env") });

const PATIENT_META: Record<
  string,
  {
    mrn: string;
    display_name: string;
    primary_diagnosis: string;
    date_of_birth: string;
    sex: "F" | "M";
  }
> = {
  hero: {
    mrn: "MRN-2024-018392",
    display_name: "Margaret Chen",
    primary_diagnosis: "Stage IV lung adenocarcinoma",
    date_of_birth: "1966-03-15",
    sex: "F",
  },
  "variant-echo-on-file": {
    mrn: "MRN-2024-018393",
    display_name: "Margaret Chen",
    primary_diagnosis: "Stage IV lung adenocarcinoma",
    date_of_birth: "1966-03-15",
    sex: "F",
  },
  "variant-prior-tki": {
    mrn: "MRN-2024-024871",
    display_name: "James Park",
    primary_diagnosis: "Stage IV lung adenocarcinoma",
    date_of_birth: "1962-11-08",
    sex: "M",
  },
};

const SECTION_DOC: Record<string, string> = {
  Demographics: "Progress Note",
  Molecular: "Genomic Report",
  Treatment: "Treatment Summary",
  Performance: "Progress Note",
  Imaging: "Imaging Report",
  Labs: "Lab Report",
  Comorbidities: "Progress Note",
  Vitals: "Clinic Visit",
  Consent: "Administrative Note",
};

const SECTION_DATE: Record<string, string> = {
  Demographics: "2026-06-10",
  Molecular: "2026-05-12",
  Treatment: "2026-06-01",
  Performance: "2026-06-10",
  Imaging: "2026-05-28",
  Labs: "2026-06-08",
  Comorbidities: "2026-06-10",
  Vitals: "2026-06-10",
  Consent: "2026-06-10",
};

async function seedPatient(slug: string) {
  const path = join(process.cwd(), "data", "charts", `${slug}.json`);
  const chart = JSON.parse(readFileSync(path, "utf-8")) as RawChart;
  const meta = PATIENT_META[slug];
  const db = getSupabaseAdmin();

  const { data: patient, error: patientError } = await db
    .from("lumen_patients")
    .upsert(
      {
        slug,
        mrn: meta.mrn,
        display_name: meta.display_name,
        primary_diagnosis: meta.primary_diagnosis,
        date_of_birth: meta.date_of_birth,
        sex: meta.sex,
        chart_synced_at: new Date().toISOString(),
        source_system: "Epic Clarity",
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (patientError || !patient) {
    throw new Error(`Failed to seed patient ${slug}: ${patientError?.message}`);
  }

  await db.from("lumen_chart_lines").delete().eq("patient_id", patient.id);

  const lines = chart.lines.map((line) => ({
    patient_id: patient.id,
    line_id: line.id,
    section: line.section,
    text: line.text,
    document_type: SECTION_DOC[line.section] ?? "Clinical Note",
    recorded_at: SECTION_DATE[line.section] ?? "2026-06-10",
  }));

  const { error: linesError } = await db.from("lumen_chart_lines").insert(lines);
  if (linesError) {
    throw new Error(`Failed to seed chart lines for ${slug}: ${linesError.message}`);
  }

  console.log(`Seeded patient ${slug} (${meta.mrn}) with ${lines.length} lines`);
}

async function seedTrials() {
  const db = getSupabaseAdmin();
  const ncts = Object.keys(TRIAL_COHORT_META);

  for (const nctId of ncts) {
    const path = join(process.cwd(), "data", "trials", `${nctId}.json`);
    const pinned = JSON.parse(readFileSync(path, "utf-8")) as {
      relevant_cohort: string;
      cohort_label: string;
      pinned_at: string;
      api_response: Record<string, unknown>;
    };
    const ps = pinned.api_response.protocolSection as {
      identificationModule?: { briefTitle?: string };
      statusModule?: { overallStatus?: string };
      designModule?: { phases?: string[] };
      eligibilityModule?: { eligibilityCriteria?: string };
    };
    const phases = ps.designModule?.phases ?? [];
    const phase = phases.length
      ? phases.map((p) => p.replace("PHASE", "Phase ").trim()).join("/")
      : null;

    const { error } = await db.from("lumen_trials").upsert(
      {
        nct_id: nctId,
        title: ps.identificationModule?.briefTitle ?? nctId,
        phase,
        status: ps.statusModule?.overallStatus ?? "RECRUITING",
        eligibility_text: ps.eligibilityModule?.eligibilityCriteria ?? "",
        relevant_cohort: pinned.relevant_cohort,
        cohort_label: pinned.cohort_label,
        registry_updated_at: pinned.pinned_at,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "nct_id" }
    );

    if (error) throw new Error(`Failed to seed trial ${nctId}: ${error.message}`);
    console.log(`Seeded trial ${nctId}`);
  }
}

async function seedCriteriaCache() {
  const db = getSupabaseAdmin();
  const path = join(process.cwd(), "data", "trials", "criteria-cache.json");
  const cache = JSON.parse(readFileSync(path, "utf-8")) as Record<
    string,
    Criterion[]
  >;

  for (const [cohortKey, criteria] of Object.entries(cache)) {
    const nctId = cohortKey.split(":")[0];
    const trialPath = join(process.cwd(), "data", "trials", `${nctId}.json`);
    const pinned = JSON.parse(readFileSync(trialPath, "utf-8")) as {
      api_response: Record<string, unknown>;
    };
    const ps = pinned.api_response.protocolSection as {
      eligibilityModule?: { eligibilityCriteria?: string };
    };
    const eligibilityText = ps.eligibilityModule?.eligibilityCriteria ?? "";
    const hash = computeEligibilityHash(eligibilityText);

    const { error } = await db.from("lumen_trial_criteria_cache").upsert(
      {
        nct_id: nctId,
        cohort_key: cohortKey,
        criteria,
        eligibility_hash: hash,
      },
      { onConflict: "cohort_key" }
    );

    if (error) {
      throw new Error(`Failed to seed criteria ${cohortKey}: ${error.message}`);
    }
    console.log(`Seeded criteria cache ${cohortKey}`);
  }
}

async function main() {
  if (!isSupabaseConfigured()) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env before seeding."
    );
    process.exit(1);
  }

  for (const slug of Object.keys(PATIENT_META)) {
    await seedPatient(slug);
  }
  await seedTrials();
  await seedCriteriaCache();
  console.log("\nSupabase seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
