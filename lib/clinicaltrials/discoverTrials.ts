import type {
  DiscoveryMetadata,
  GeoFilter,
  IngestedTrial,
  PatientProfile,
  SearchSummary,
} from "../types";
import { computeProfileHash } from "../chartHash";
import { studyToIngested, upsertTrialFromCTGov } from "../db/trials";
import {
  getDiscoveryCache,
  saveDiscoveryCache,
} from "../db/discoveryCache";
import { usePinnedTrials } from "../productConfig";
import { buildSearchQuery } from "./buildSearchQuery";
import {
  ctgovFetchLimit,
  fetchStudies,
  maxDiscoveredTrials,
  pinnedNctsForDiscovery,
  searchAllStudies,
} from "./client";
import { rankCandidates } from "./rankCandidates";

function mergeStudiesByNct(
  primary: Awaited<ReturnType<typeof searchAllStudies>>,
  pinned: Awaited<ReturnType<typeof fetchStudies>>
) {
  const map = new Map<string, (typeof primary)[number]>();
  for (const s of [...primary, ...pinned]) {
    map.set(s.nctId, s);
  }
  return [...map.values()];
}

export async function discoverTrialsForPatient(
  profile: PatientProfile,
  opts: {
    patientUuid?: string | null;
    fallbackDiagnosis?: string;
    skipCache?: boolean;
    geoFilter?: GeoFilter;
  } = {}
): Promise<{ trials: IngestedTrial[]; discovery: DiscoveryMetadata }> {
  const profileHash = computeProfileHash(profile);
  const evaluateCap = maxDiscoveredTrials();
  const fetchCap = ctgovFetchLimit();

  if (opts.patientUuid && !opts.skipCache) {
    const cached = await getDiscoveryCache(opts.patientUuid, profileHash);
    if (
      cached &&
      JSON.stringify(cached.search_params.geo ?? null) ===
        JSON.stringify(opts.geoFilter ?? null)
    ) {
      const studies = await fetchStudies(cached.nct_ids);
      const trials: IngestedTrial[] = [];
      for (const study of studies) {
        await upsertTrialFromCTGov(study);
        trials.push(studyToIngested(study));
      }
      return {
        trials,
        discovery: {
          discovered_trials: trials.length,
          search_summary: cached.search_params,
          nct_ids: cached.nct_ids,
          from_cache: true,
        },
      };
    }
  }

  const { params, summary } = buildSearchQuery(
    profile,
    opts.fallbackDiagnosis,
    opts.geoFilter
  );

  let studies = await searchAllStudies(params, fetchCap);
  if (usePinnedTrials()) {
    const pinned = pinnedNctsForDiscovery();
    if (pinned.length) {
      const pinnedStudies = await fetchStudies(pinned);
      studies = mergeStudiesByNct(studies, pinnedStudies);
    }
  }

  const ranked = rankCandidates(studies, profile, evaluateCap, opts.geoFilter);
  const nctIds = ranked.map((s) => s.nctId);

  if (opts.patientUuid) {
    await saveDiscoveryCache(opts.patientUuid, profileHash, nctIds, summary);
  }

  const trials: IngestedTrial[] = [];
  for (const study of ranked) {
    await upsertTrialFromCTGov(study);
    trials.push(studyToIngested(study));
  }

  return {
    trials,
    discovery: {
      discovered_trials: trials.length,
      search_summary: summary,
      nct_ids: nctIds,
      from_cache: false,
    },
  };
}
