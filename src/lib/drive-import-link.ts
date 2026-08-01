// The link that turns a Drive share notification into something a player can
// act on.
//
// Drive's own email is honest but useless to a human: its button opens the
// `.5echar` file, which renders as a wall of JSON. The app's import flow, on
// the other side, was a Picker buried in the nav overflow menu — the recipient
// had to already know it existed and then find their friend's character among
// everything ever shared with them. This module is the seam between the two.
//
// What the link deliberately does *not* do is import on arrival. The app holds
// the `drive.file` scope, which grants per-file access only to files the user
// created here or picked through the Google Picker. A file id in a URL is a
// name we have no right to read yet, so the link's job is to carry the id and
// the name far enough that the Picker can open on that one file. Widening the
// scope would make the link self-sufficient and make every user approve
// read-everything-in-your-Drive to accept one character sheet.

// A Drive file id is URL-safe already; the name needs encoding and is only ever
// a hint, so a missing or stale one costs the recipient a search box, not the
// import.
export function importLinkFor(
  origin: string,
  fileId: string,
  fileName?: string,
): string {
  const query = fileName ? `?name=${encodeURIComponent(fileName)}` : "";
  return `${origin}/import/${fileId}${query}`;
}

// The Picker searches Drive by name, and the stored name carries our extension
// (`Tarion.5echar`). Searching for the whole thing matches nothing useful in
// some locales, so query on the character's name alone.
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
