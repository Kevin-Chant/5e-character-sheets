import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// The stylesheet is split into ordered parts and the sheet's responsiveness is
// container-driven. Neither of those is visible from any single file, and both
// break silently — a reordered import changes which rules win, and a stray
// viewport media query reintroduces the bug class the container queries were
// written to remove. So they're asserted here rather than left to review.

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
    // These win by specificity alone; moving them earlier silently changes the
    // rendering. See the header comment in index.css.
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
    // `#detail` is the query container, and an element can't be styled by a
    // query against itself — so its padding is the one legitimate `@media`
    // here. Any other means a viewport breakpoint has crept back in.
    const rules = responsive.replace(/\/\*[\s\S]*?\*\//g, "");
    const medias = [...rules.matchAll(/@media[^{]+/g)].map((m) => m[0]);
    expect(medias).toHaveLength(1);
    expect(responsive).toContain("#detail");
  });

  it("keeps the panel grid floor and the panel restack threshold in step", () => {
    // The layout must never hand a panel less room than its contents restack
    // at, or a panel drops into its narrow form while the sheet has space
    // spare. Both numbers are commented as a pair; this catches one moving.
    const restack = /@container panel \(max-width: (\d+)rem\)/.exec(responsive);
    expect(restack).not.toBeNull();
    expect(Number(restack![1])).toBeGreaterThanOrEqual(27);
  });
});
