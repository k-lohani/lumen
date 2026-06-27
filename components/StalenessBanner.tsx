"use client";

import type { TrialVerdict } from "@/lib/types";

interface StalenessBannerProps {
  trial: TrialVerdict;
}

export function StalenessBanner({ trial }: StalenessBannerProps) {
  const protocolDate = trial.protocol_last_updated;
  if (!protocolDate || !trial.registry_synced_at) return null;

  const cached = new Date(trial.registry_synced_at);
  const registry = new Date(protocolDate);
  if (Number.isNaN(cached.getTime()) || Number.isNaN(registry.getTime())) {
    return null;
  }

  if (cached >= registry) return null;

  return (
    <p className="mt-2 rounded-md border border-honey/30 bg-honey-light/50 px-3 py-1.5 text-xs font-medium text-honey-dark">
      Protocol may have changed — re-run pre-screen (registry updated{" "}
      {protocolDate})
    </p>
  );
}
