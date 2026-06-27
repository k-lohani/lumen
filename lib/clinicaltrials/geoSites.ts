import type { GeoFilter, TrialVerdict } from "../types";

const EARTH_RADIUS_MI = 3958.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMi(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}

interface LocationModule {
  facility?: string;
  city?: string;
  state?: string;
  country?: string;
  status?: string;
  geoPoint?: { lat?: number; lon?: number };
}

function extractLocations(raw: Record<string, unknown>): LocationModule[] {
  const ps = raw.protocolSection as
    | { contactsLocationsModule?: { locations?: LocationModule[] } }
    | undefined;
  return ps?.contactsLocationsModule?.locations ?? [];
}

export interface NearbySite {
  facility: string;
  city: string;
  state?: string;
  distanceMi: number;
}

export function sitesNearGeo(
  raw: Record<string, unknown>,
  geo: GeoFilter
): NearbySite[] {
  const locations = extractLocations(raw);
  const nearby: NearbySite[] = [];

  for (const loc of locations) {
    const lat = loc.geoPoint?.lat;
    const lon = loc.geoPoint?.lon;
    if (lat == null || lon == null) continue;
    const distanceMi = haversineMi(geo.lat, geo.lng, lat, lon);
    if (distanceMi > geo.radiusMi) continue;
    if (loc.status && loc.status !== "RECRUITING") continue;
    nearby.push({
      facility: loc.facility ?? "Study site",
      city: loc.city ?? "",
      state: loc.state,
      distanceMi: Math.round(distanceMi),
    });
  }

  nearby.sort((a, b) => a.distanceMi - b.distanceMi);
  return nearby.slice(0, 5);
}

export function enrichVerdictWithGeo(
  verdict: TrialVerdict,
  trialRaw: Record<string, unknown>,
  geo: GeoFilter
): TrialVerdict {
  const sites = sitesNearGeo(trialRaw, geo);
  return {
    ...verdict,
    recruiting_sites_nearby: sites.length,
    nearest_sites: sites.map((s) => ({
      facility: s.facility,
      city: s.city,
      state: s.state,
    })),
  };
}
