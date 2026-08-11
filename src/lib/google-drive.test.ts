import { describe, expect, it } from "vitest";
import { buildShareUrl } from "src/lib/google-drive";

// `emailMessage`/`sendNotificationEmail` are query parameters on
// permissions.create; sent as Permission body fields they're silently
// ignored, so the share succeeds but the note never appears.
describe("buildShareUrl", () => {
  it("puts the notification options in the query string, not the body", () => {
    const url = new URL(buildShareUrl("file123", "Open Tarion: https://x/y"));
    expect(url.pathname).toBe("/drive/v3/files/file123/permissions");
    expect(url.searchParams.get("sendNotificationEmail")).toBe("true");
    expect(url.searchParams.get("emailMessage")).toBe(
      "Open Tarion: https://x/y",
    );
  });

  it("round-trips a message with the newlines and punctuation ours has", () => {
    const message = "Open Tarion: https://x/y?name=A%20B\n\nSign in & confirm.";
    const url = new URL(buildShareUrl("file123", message));
    expect(url.searchParams.get("emailMessage")).toBe(message);
  });

  it("still asks for the notification when there's no custom message", () => {
    const url = new URL(buildShareUrl("file123"));
    expect(url.searchParams.get("sendNotificationEmail")).toBe("true");
    expect(url.searchParams.has("emailMessage")).toBe(false);
  });
});
