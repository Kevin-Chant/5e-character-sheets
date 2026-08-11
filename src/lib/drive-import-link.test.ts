import { describe, expect, it } from "vitest";
import {
  importLinkFor,
  pickerQueryFor,
  shareEmailMessage,
} from "src/lib/drive-import-link";

describe("importLinkFor", () => {
  it("lands on the import route for the shared file", () => {
    expect(
      importLinkFor("https://example.com", "1a2b3c", "Tarion.5echar"),
    ).toBe("https://example.com/import/1a2b3c?name=Tarion.5echar");
  });

  it("encodes a name with spaces and punctuation", () => {
    const link = importLinkFor(
      "https://example.com",
      "abc",
      "Sir Reg, II.5echar",
    );
    expect(link).toBe(
      "https://example.com/import/abc?name=Sir%20Reg%2C%20II.5echar",
    );
    const parsed = new URL(link);
    expect(parsed.searchParams.get("name")).toBe("Sir Reg, II.5echar");
    expect(parsed.pathname).toBe("/import/abc");
  });

  it("omits the name when there isn't one, rather than sending an empty hint", () => {
    expect(importLinkFor("https://example.com", "abc")).toBe(
      "https://example.com/import/abc",
    );
  });
});

describe("pickerQueryFor", () => {
  it("searches on the character name, not the stored filename", () => {
    expect(pickerQueryFor("Tarion.5echar")).toBe("Tarion");
  });

  it("is undefined when there is nothing worth searching for", () => {
    expect(pickerQueryFor(undefined)).toBeUndefined();
    expect(pickerQueryFor(".5echar")).toBeUndefined();
    expect(pickerQueryFor("  ")).toBeUndefined();
  });
});

describe("shareEmailMessage", () => {
  it("leads with the link, since Drive's own button goes to raw JSON", () => {
    const message = shareEmailMessage("Tarion", "https://example.com/import/x");
    expect(message).toContain("https://example.com/import/x");
    expect(message).toContain("Tarion");
  });

  it("still reads as a sentence for an unnamed character", () => {
    expect(shareEmailMessage("  ", "https://example.com/import/x")).toContain(
      "a character sheet",
    );
  });
});
