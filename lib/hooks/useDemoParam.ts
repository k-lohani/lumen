"use client";

import { useSearchParams } from "next/navigation";

export function useDemoParam(): boolean {
  const searchParams = useSearchParams();
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") return true;
  return searchParams.get("demo") === "1";
}

export function demoQueryString(demo: boolean): string {
  return demo ? "demo=1" : "";
}

export function withDemoParam(path: string, demo: boolean): string {
  if (!demo) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}demo=1`;
}
