// Probing a live-edit sidecar's /health endpoint.
//
// Split out from the settings component because the interesting part is the
// classification, not the rendering: a wrong host, a host that's up but not a
// sidecar, and a host that's simply down all fail differently and deserve
// different words. Pure apart from the injected `fetch`, so it's testable
// without a network.

export type HealthResult =
  | { status: "ok"; uptimeSeconds?: number }
  // Reached something that answered, but not a healthy sidecar.
  | { status: "bad-response"; detail: string }
  // Never got an answer: DNS, TLS, CORS, refused connection, or timeout.
  | { status: "unreachable"; detail: string }
  // The URL itself doesn't parse, so there was nothing to try.
  | { status: "invalid-url"; detail: string };

// How long to wait before calling it unreachable. Long enough for a cold
// sidecar on a small box, short enough that a dead host doesn't hang the UI —
// the failure mode this was built for had the box dropping packets entirely,
// where the only symptom is a stalled connection.
export const HEALTH_TIMEOUT_MS = 8000;

// Trailing slashes are the most common paste error and would produce a
// double-slash path, so normalise rather than fail.
export function healthUrl(host: string): string {
  return `${host.trim().replace(/\/+$/, "")}/health`;
}

export async function checkSidecarHealth(
  host: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<HealthResult> {
  const trimmed = host.trim();
  if (!trimmed) return { status: "invalid-url", detail: "No host set." };
  let url: string;
  try {
    // Reject anything that isn't an absolute http(s) URL up front — a bare
    // hostname would otherwise resolve against the app's own origin and
    // "succeed" against the SPA, which is a confusing way to fail.
    const parsed = new URL(healthUrl(trimmed));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return {
        status: "invalid-url",
        detail: "The host must start with http:// or https://.",
      };
    url = parsed.toString();
  } catch {
    return { status: "invalid-url", detail: "That isn't a valid URL." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok)
      return {
        status: "bad-response",
        detail: `The server answered with ${res.status}.`,
      };
    // A healthy sidecar returns JSON, but an older one (or a proxy in front of
    // it) may return an empty 200. Treat that as healthy rather than failing on
    // a body we only wanted for the extra detail.
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "uptime" in body)
        return { status: "ok", uptimeSeconds: Number(body.uptime) };
    } catch {
      // Empty or non-JSON body — still a 200 from the right path.
    }
    return { status: "ok" };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      status: "unreachable",
      detail: aborted
        ? "Timed out — the server didn't respond."
        : "Couldn't reach the server. Check the address, or it may be down.",
    };
  } finally {
    clearTimeout(timer);
  }
}

// One line of user-facing prose for a result.
export function describeHealth(result: HealthResult): string {
  switch (result.status) {
    case "ok":
      return result.uptimeSeconds !== undefined
        ? `Connected — sidecar up for ${formatUptime(result.uptimeSeconds)}.`
        : "Connected.";
    default:
      return result.detail;
  }
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "an unknown time";
  const days = Math.floor(seconds / 86400);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${Math.floor(seconds)} seconds`;
}
