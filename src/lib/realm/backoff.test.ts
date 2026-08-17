import { describe, expect, it } from "vitest";
import { backoffDelayMs, RECONNECT_JITTER } from "src/lib/realm/backoff";

const LADDER = [500, 2_000, 8_000];

describe("backoffDelayMs", () => {
  it("walks the ladder", () => {
    expect(backoffDelayMs(0, LADDER)).toBe(500);
    expect(backoffDelayMs(1, LADDER)).toBe(2_000);
    expect(backoffDelayMs(2, LADDER)).toBe(8_000);
  });

  it("holds at the tail rung rather than running off the end", () => {
    expect(backoffDelayMs(3, LADDER)).toBe(8_000);
    expect(backoffDelayMs(9_999, LADDER)).toBe(8_000);
  });

  it("treats a negative attempt as the first", () => {
    expect(backoffDelayMs(-1, LADDER)).toBe(500);
  });

  it("only ever adds to the rung, never subtracts", () => {
    for (let i = 0; i < 200; i++) {
      const delay = backoffDelayMs(1, LADDER, RECONNECT_JITTER);
      expect(delay).toBeGreaterThanOrEqual(2_000);
      expect(delay).toBeLessThanOrEqual(2_500);
    }
  });

  it("spreads jittered retries across the window", () => {
    const seen = new Set(
      Array.from({ length: 200 }, () =>
        backoffDelayMs(1, LADDER, RECONNECT_JITTER),
      ),
    );
    expect(seen.size).toBeGreaterThan(10);
  });
});
