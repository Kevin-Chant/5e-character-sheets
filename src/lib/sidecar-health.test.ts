import { describe, expect, it, vi } from "vitest";
import {
  checkSidecarHealth,
  describeHealth,
  healthUrl,
} from "./sidecar-health";

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

describe("healthUrl", () => {
  it("appends /health, tolerating trailing slashes", () => {
    expect(healthUrl("https://live.example.net")).toBe(
      "https://live.example.net/health",
    );
    expect(healthUrl("https://live.example.net/")).toBe(
      "https://live.example.net/health",
    );
    expect(healthUrl("  https://live.example.net///  ")).toBe(
      "https://live.example.net/health",
    );
  });
});

describe("checkSidecarHealth", () => {
  it("reports ok with the uptime the sidecar returns", async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      jsonResponse({ status: "ok", uptime: 7200 }),
    );
    const result = await checkSidecarHealth(
      "https://live.example.net",
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ status: "ok", uptimeSeconds: 7200 });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://live.example.net/health");
  });

  it("accepts an older sidecar that returns an empty 200", async () => {
    const fetchImpl = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("not json");
          },
        }) as unknown as Response,
    );
    expect(
      await checkSidecarHealth(
        "https://live.example.net",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toEqual({ status: "ok" });
  });

  it("distinguishes a bad status from an unreachable host", async () => {
    const bad = await checkSidecarHealth(
      "https://live.example.net",
      vi.fn(async () => jsonResponse({}, 502)) as unknown as typeof fetch,
    );
    expect(bad.status).toBe("bad-response");
    expect(bad).toHaveProperty("detail", expect.stringContaining("502"));

    const down = await checkSidecarHealth(
      "https://live.example.net",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    );
    expect(down.status).toBe("unreachable");
  });

  it("reports a timeout distinctly — the dead-box symptom is a stall", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    const result = await checkSidecarHealth(
      "https://live.example.net",
      fetchImpl as unknown as typeof fetch,
      10,
    );
    expect(result.status).toBe("unreachable");
    expect(result).toHaveProperty("detail", expect.stringContaining("Timed"));
  });

  it("rejects a host that isn't an absolute http(s) URL without fetching", async () => {
    const fetchImpl = vi.fn();
    for (const host of ["", "   ", "live.example.net", "ws://live.example.net"])
      expect(
        (await checkSidecarHealth(host, fetchImpl as unknown as typeof fetch))
          .status,
        host,
      ).toBe("invalid-url");
    // A bare hostname would otherwise resolve against the app's own origin and
    // "succeed" against the SPA itself, which is a confusing way to fail.
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("describeHealth", () => {
  it("phrases uptime in the largest sensible unit", () => {
    const say = (uptimeSeconds: number) =>
      describeHealth({ status: "ok", uptimeSeconds });
    expect(say(45)).toContain("45 seconds");
    expect(say(600)).toContain("10 minutes");
    expect(say(7200)).toContain("2 hours");
    expect(say(172800)).toContain("2 days");
    expect(say(86400)).toContain("1 day");
    expect(say(86400)).not.toContain("1 days");
  });

  it("passes a failure's own detail through", () => {
    expect(
      describeHealth({ status: "unreachable", detail: "Timed out." }),
    ).toBe("Timed out.");
  });
});
