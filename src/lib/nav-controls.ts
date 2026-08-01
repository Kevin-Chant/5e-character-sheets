// Which nav controls belong on which surface.
//
// Pulled out of `root.tsx` because it's a decision table, and the bug it fixes
// was a decision-table bug: every control keyed off `character` ("is a sheet
// loaded"), which meant the same thing back when the sheet was the only place a
// character could be open. Once /play, /host and /join became routes it stopped
// meaning that, and Settings quietly inherited the sheet's whole toolbar — an
// edit-mode lock toggling something you can't see, a share button for a sheet
// you aren't looking at, an undo reverting an edit on another page.
//
// Keeping it here means the matrix is testable without mounting the nav's eight
// context providers, and a new route has one obvious place to declare itself.

export interface NavContext {
  pathname: string;
  hasCharacter: boolean;
  // A datastore is selected. The character drawer lists saved sheets, so
  // without one it opens on "Not connected to saved characters" and nothing to
  // click.
  hasDatastore: boolean;
  // The open sheet is ours to offer — not joined remotely, not borrowed from a
  // DM. Computed by the caller, which is where the sharing roles live.
  canShare: boolean;
  // With autosave on (the default) an explicit save button duplicates the
  // indicator sitting next to it, and ⌘S covers the impatient.
  autosave: boolean;
}

export interface NavControls {
  characterDrawer: boolean;
  playToggle: boolean;
  rollMode: boolean;
  editMode: boolean;
  share: boolean;
  // Undo/redo stay in the nav rather than somewhere more sheet-local: they have
  // keyboard shortcuts, so this is the only place anyone discovers them.
  undoRedo: boolean;
  // Status rather than an action, so it shows wherever the sheet is live — a
  // failed save is worth knowing about on the board too.
  saveIndicator: boolean;
  saveButton: boolean;
}

export function navControls({
  pathname,
  hasCharacter,
  hasDatastore,
  canShare,
  autosave,
}: NavContext): NavControls {
  // /sheet/<uuid> is the same surface with the open character in the URL.
  const onSheet = pathname === "/sheet" || pathname.startsWith("/sheet/");
  const onPlay = pathname === "/play";
  const onCharacterSurface = onSheet || onPlay;
  const sheetWithCharacter = onSheet && hasCharacter;

  return {
    characterDrawer: hasDatastore,
    playToggle: hasCharacter && onCharacterSurface,
    // The board is a roll surface whether or not a character is open — a DM
    // running monsters rolls too.
    rollMode: onPlay || sheetWithCharacter,
    editMode: sheetWithCharacter,
    share: canShare && onSheet,
    undoRedo: sheetWithCharacter,
    saveIndicator: hasCharacter && onCharacterSurface,
    saveButton: hasCharacter && onCharacterSurface && !autosave,
  };
}

// The bar's title. Every route names itself; the two that show a character fall
// back to naming the surface when none is open.
export function navTitle(pathname: string, characterName?: string): string {
  switch (pathname) {
    // No "/settings" case: settings is an overlay now, and the alias route
    // redirects before a title would ever be read.
    case "/host":
      return "Start a game";
    case "/auth":
      return "Google Drive";
    // Bare /join is manual entry for a shared *sheet*; /join/<code> is the
    // invite link, which is a game until the probe says otherwise.
    case "/join":
      return "Join a shared sheet";
    case "/play":
      return characterName ?? "At the table";
    case "/sheet":
      return characterName ?? "Character Select";
    default:
      if (pathname.startsWith("/sheet/"))
        return characterName ?? "Character Select";
      if (pathname.startsWith("/join/")) return "Join a game";
      // The share email's link. Named for what it does rather than for the
      // file it names, which the page itself is better placed to show.
      if (pathname.startsWith("/import/")) return "Add a shared character";
      return "Home";
  }
}
