import { describe, expect, it } from "vitest";
import { navControls, navTitle, NavContext } from "./nav-controls";

// The nav grew a control per feature and never lost one, until the same eleven
// buttons were rendering on pages where three of them did anything. These pin
// the matrix per surface — the regression to guard against is a control
// spreading back to a page it can't act on.

function context(over: Partial<NavContext> = {}): NavContext {
  return {
    pathname: "/sheet",
    hasCharacter: true,
    hasDatastore: true,
    canShare: true,
    autosave: true,
    ...over,
  };
}

// The controls on, so a test can name what's *missing* rather than list eight.
const shown = (over: Partial<NavContext> = {}) =>
  Object.entries(navControls(context(over)))
    .filter(([, on]) => on)
    .map(([name]) => name)
    .sort();

describe("what the nav offers, per surface", () => {
  it("gives the sheet everything that acts on a sheet", () => {
    expect(shown()).toEqual([
      "characterDrawer",
      "editMode",
      "playToggle",
      "rollMode",
      "saveIndicator",
      "share",
      "undoRedo",
    ]);
  });

  it("gives settings only the things that work there", () => {
    // The bug this replaces: identical to the sheet, edit lock and all.
    expect(shown({ pathname: "/settings" })).toEqual(["characterDrawer"]);
  });

  it("leaves sheet-editing controls off the board", () => {
    const play = navControls(context({ pathname: "/play" }));
    expect(play.editMode).toBe(false);
    expect(play.share).toBe(false);
    // Undo on the board would invite the expectation that it undoes the fight.
    expect(play.undoRedo).toBe(false);
    // But rolling and getting back to the sheet are the point of being there.
    expect(play.rollMode).toBe(true);
    expect(play.playToggle).toBe(true);
    expect(play.saveIndicator).toBe(true);
  });

  it("still offers the board's dice to a DM running monsters with no sheet", () => {
    const dm = navControls(
      context({ pathname: "/play", hasCharacter: false, canShare: false }),
    );
    expect(dm.rollMode).toBe(true);
    expect(dm.playToggle).toBe(false);
    expect(dm.saveIndicator).toBe(false);
  });

  it("hides the character drawer when there's nothing for it to list", () => {
    expect(navControls(context({ hasDatastore: false })).characterDrawer).toBe(
      false,
    );
  });

  it("keeps the save button only for someone who turned autosave off", () => {
    expect(navControls(context()).saveButton).toBe(false);
    expect(navControls(context({ autosave: false })).saveButton).toBe(true);
    // And never where there's no sheet to save.
    expect(
      navControls(context({ autosave: false, pathname: "/settings" }))
        .saveButton,
    ).toBe(false);
  });

  it("won't offer to share a sheet that isn't ours", () => {
    expect(navControls(context({ canShare: false })).share).toBe(false);
  });

  it("shows the entry routes nothing but the drawer", () => {
    for (const pathname of ["/", "/host", "/join", "/join/abc", "/auth"]) {
      expect(shown({ pathname, hasCharacter: false, canShare: false })).toEqual(
        ["characterDrawer"],
      );
    }
  });
});

describe("the title names the page", () => {
  it("names each route", () => {
    expect(navTitle("/settings")).toBe("Settings");
    expect(navTitle("/host")).toBe("Start a game");
    // Both used to fall through to "Home".
    expect(navTitle("/auth")).toBe("Google Drive");
    expect(navTitle("/")).toBe("Home");
  });

  it("tells a shared sheet from a game, since one route forwards to the other", () => {
    expect(navTitle("/join/3f8a91c2")).toBe("Join a game");
    expect(navTitle("/join")).toBe("Join a shared sheet");
  });

  it("names the character where one is open, and the surface otherwise", () => {
    expect(navTitle("/sheet", "Brakka")).toBe("Brakka");
    expect(navTitle("/play", "Brakka")).toBe("Brakka");
    expect(navTitle("/sheet")).toBe("Character Select");
    expect(navTitle("/play")).toBe("At the table");
  });
});
