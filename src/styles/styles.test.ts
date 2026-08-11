import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Pins two invariants invisible from any single file: the stylesheet import
// order (later parts override earlier ones) and container-driven
// responsiveness (no stray viewport media queries).

const dir = join(__dirname);
const index = readFileSync(join(dir, "..", "index.css"), "utf8");
const parts = readdirSync(dir).filter((f) => f.endsWith(".css"));

describe("index.css as an ordered barrel", () => {
  const imported = [...index.matchAll(/@import "\.\/styles\/([^"]+)"/g)].map(
    (m) => m[1],
  );

  it("imports every part exactly once", () => {
    expect([...imported].sort()).toEqual([...parts].sort());
  });

  it("contains only imports and comments — no rules of its own", () => {
    const withoutComments = index.replace(/\/\*[\s\S]*?\*\//g, "");
    const stray = withoutComments
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("@import"));
    expect(stray).toEqual([]);
  });

  it("keeps the override parts last, in order", () => {
    const tail = imported.slice(-3);
    expect(tail).toEqual([
      "responsive-sheet.css",
      "ui-refresh.css",
      "rests.css",
    ]);
  });
});

describe("sheet responsiveness is container-driven", () => {
  const responsive = readFileSync(join(dir, "responsive-sheet.css"), "utf8");

  it("declares the containers the queries name", () => {
    const layout = readFileSync(join(dir, "layout.css"), "utf8");
    const utilities = readFileSync(join(dir, "utilities.css"), "utf8");
    expect(layout).toContain("container: detail / inline-size");
    expect(layout).toContain("container: panel / inline-size");
    expect(utilities).toContain("container: identity / inline-size");
  });

  it("queries only containers that exist", () => {
    const named = [...responsive.matchAll(/@container\s+([a-z-]+)\s*\(/g)].map(
      (m) => m[1],
    );
    expect(named.length).toBeGreaterThan(0);
    for (const name of named)
      expect(["detail", "panel", "identity"]).toContain(name);
  });

  it("keeps exactly one viewport media query, for the container's own padding", () => {
    // #detail is the query container; an element can't be styled by a query
    // against itself, so its padding is the one legitimate @media here.
    const rules = responsive.replace(/\/\*[\s\S]*?\*\//g, "");
    const medias = [...rules.matchAll(/@media[^{]+/g)].map((m) => m[0]);
    expect(medias).toHaveLength(1);
    expect(responsive).toContain("#detail");
  });

  it("keeps the panel grid floor and the panel restack threshold in step", () => {
    const restack = /@container panel \(max-width: (\d+)rem\)/.exec(responsive);
    expect(restack).not.toBeNull();
    expect(Number(restack![1])).toBeGreaterThanOrEqual(27);
  });
});
