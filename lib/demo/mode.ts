export function isDemoModeEnv(): boolean {
  const v = process.env.DEMO_MODE;
  return v === "1" || v === "true";
}

export function isDemoModeRequest(
  request?: Request,
  body?: { demo?: boolean }
): boolean {
  if (isDemoModeEnv()) return true;
  if (body?.demo === true) return true;
  if (request) {
    const url = new URL(request.url);
    if (url.searchParams.get("demo") === "1") return true;
  }
  return false;
}

export function isClientDemoMode(
  searchParams: URLSearchParams | null
): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") return true;
  if (searchParams?.get("demo") === "1") return true;
  return false;
}
