// Which nav controls belong on which surface, keyed by route rather than by
// "is a character loaded" — that condition used to give /settings the sheet's
// whole toolbar once /play, /host and /join became routes too. Testable as a
// pure table without mounting the nav's context providers.

export interface NavContext {
  pathname: string;
  hasCharacter: boolean;
  // A datastore is selected. The character drawer lists saved sheets, so
  // without one it opens on "Not connected to saved characters" and nothing to
  // click.
  hasDatastore: boolean;
  // The open sheet is ours to offer — not joined remotely, not borrowed from a
  // DM. Computed by the caller.
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
  // /play/<code> is the same surface with the table in the URL.
  const onPlay = pathname === "/play" || pathname.startsWith("/play/");
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
      if (pathname.startsWith("/play/")) return characterName ?? "At the table";
      if (pathname.startsWith("/join/")) return "Join a game";
      // The share email's link. Named for what it does rather than for the
      // file it names, which the page itself is better placed to show.
      if (pathname.startsWith("/import/")) return "Add a shared character";
      return "Home";
  }
}
