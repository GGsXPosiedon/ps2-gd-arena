// Light protection for a public deployment: the API routes spend the deployer's AI credits.
// - Same-site only (in production): requests must come from pages on this deployment.
// - Per-IP rate limit (best effort: in-memory, per server instance).

const hits = new Map<string, number[]>();

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

function sameSite(request: Request): boolean {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const from = request.headers.get("origin") ?? request.headers.get("referer");
  if (!host || !from) return false;
  try {
    return new URL(from).host === host;
  } catch {
    return false;
  }
}

/** Returns an error response if the request should be refused, otherwise null. */
export function guard(request: Request, route: string, perMinute: number): Response | null {
  if (process.env.NODE_ENV === "production" && !sameSite(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Offline mock requests (the e2e suite) cost nothing, so they aren't rate limited.
  if (request.headers.get("x-floor-mock") === "1") return null;
  const key = `${route}:${clientIp(request)}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) {
    return Response.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429 });
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return null;
}
