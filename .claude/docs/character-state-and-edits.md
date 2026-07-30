# Character state & the edit write-path

Every change to the open character — a keystroke in a modal, an undo, a peer's
live edit — flows through one reducer and one dispatch wrapper. Understanding
this path explains why edits broadcast, why undo works, and the constraints an
editor component must respect. The pieces: `src/lib/hooks/reducers/`
(reducer + actions) and `src/lib/hooks/use-character.tsx` (the context wrapper).

## Actions fully specify a field's new value

There is essentially one edit action, `update_<FIELD>` (`actions.ts`), carrying
a `payload.value` and an optional `subField` dot-path. `reducer.ts` is
deliberately tiny: it `structuredClone`s the character and hands off to
`setFieldValue(path, clone, value)` (`src/lib/fields.ts`), which walks the
dotted path (`"attacks.0.formula"`) and writes the leaf. The only other actions
are `load_character` (replace wholesale) and `reset_character` (clear to
`undefined`).

The load-bearing decision here: **an `update_*` action carries the field's
_entire_ new value, not a delta.** That single property is what makes two
otherwise-hard features fall out cheaply:

- **Undo/redo** — `invertAction` reads the value _currently_ at the target path
  and packages it as the reverse action. Applying it restores the prior state
  exactly, with no per-field undo logic.
- **Live sync** — an action is a self-contained instruction any peer can replay
  against their own copy (see [live-editing-and-presence.md](live-editing-and-presence.md)).

**Constraint that follows from `setFieldValue`:** it writes a leaf but does not
create missing ancestor objects. An editor writing `updateData(field, value,
"a.b.c")` must ensure `a.b` already exists — build nested objects wholesale when
they might be absent, rather than relying on deep-path autovivification.

## `dispatchAndBroadcast`: the one wrapper everything goes through

`use-character.tsx` exposes `dispatch` as `dispatchAndBroadcast`, which layers
three concerns on top of the raw reducer dispatch, gated by flags:

- **Dirty tracking** — sets `unsavedChanges`, which drives debounced autosave,
  the tab-title dot, and the before-unload guard. `load_character` is never
  dirty (opening a saved sheet must not mark it unsaved).
- **Undo history** — records `{action, inverse}` onto a per-tab `past` stack for
  genuine local edits only. Remote echoes and undo/redo replays are excluded via
  the `suppressBroadcast` / `record` flags.
- **Broadcast** — publishes the action to any open sharing session for this
  character.

The flag surface (`dirtyAction`, `suppressBroadcast`, `record`) exists so the
three edit _sources_ reuse one path without feeding each other loops: a **local
edit** does all three; an **undo/redo** replays and broadcasts but doesn't
re-record; a **remote edit** is applied with `suppressBroadcast` so it isn't
re-published back to the sender. Undo/redo history is intentionally per-tab and
local — it undoes _your_ edits, not a peer's.

## Whole-character writes don't block their UI

Flows that dispatch an entire character at once — the creation wizard, the
level-up wizard, a move between storage backends — close their modal (or open
the sheet) immediately and persist via `persistCharacter(character)` on the
context, not by awaiting `save()` inline. `persistCharacter` stages the entry
into the datastore context's reactive list right away (`stageCharacter`, which
marks the uuid in `unsynced` until a save for it confirms — the picker and
sidebar render that as a small pulsing cloud badge), raises `unsavedChanges`,
and reports success/failure through the same nav save indicator autosave uses.
An "edit sequence" counter guards the dirty flag: a save that resolves after a
newer edit landed must not clear it. Don't reintroduce an awaited save in front
of a modal close — on Drive that's a multi-second round-trip the user just
stares at.

## Consequences for editor components

- Get the reactive character from `useCharacter()`, never a snapshot.
- Write through `dispatch(updateData(field, { value }, subField))`. Because the
  action replaces the whole value at the path, pass the complete intended value.
- Inside a modal you're editing a **draft** copy, not the live character — the
  modal's own reducer buffers edits until save. See
  [editable-fields-and-modals.md](editable-fields-and-modals.md).
- A `remote`-role character is owned by the host and must not be persisted
  locally; the save path checks the role before writing.
