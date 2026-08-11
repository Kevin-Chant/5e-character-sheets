// The link that turns a Drive share notification into something a player can
// act on: Drive's own email button opens the raw `.5echar` JSON.
//
// The link does not import on arrival. Under the `drive.file` scope, a file id
// grants access only to files created here or picked through the Google
// Picker, so a file id in a URL can't be read yet — the link carries id + name
// far enough for the Picker to open on that one file. Widening to a broader
// scope would let the link self-import, at the cost of every user approving
// read-everything-in-your-Drive to accept one sheet.

// The file id is URL-safe already; the name is only a hint, so a missing or
// stale one costs the recipient a search box, not the import.
export function importLinkFor(
  origin: string,
  fileId: string,
  fileName?: string,
): string {
  const query = fileName ? `?name=${encodeURIComponent(fileName)}` : "";
  return `${origin}/import/${fileId}${query}`;
}

// The Picker searches by name; strip the `.5echar` extension so the query is
// just the character's name.
export function pickerQueryFor(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const stripped = fileName.replace(/\.5echar$/, "").trim();
  return stripped || undefined;
}

// The note Drive puts in its notification email, above its own file button.
// Plain text — Drive offers no formatting, and Gmail linkifies the bare URL.
export function shareEmailMessage(characterName: string, link: string): string {
  const named = characterName.trim() || "a character sheet";
  return (
    `Open ${named} in D&D Character Sheets: ${link}\n\n` +
    `That link walks you through adding the sheet to your own list — sign in ` +
    `with this Google account and confirm the file when asked. ` +
    `(The button below opens the raw file in Drive, which won't be much to look at.)`
  );
}
