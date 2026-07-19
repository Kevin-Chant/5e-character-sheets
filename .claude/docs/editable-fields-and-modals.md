# Editable fields & the modal editing system

How a value on a `Character` becomes viewable and editable on the sheet. This
wiring is spread across several files and is not obvious from any one of them;
reconstruct it from here rather than re-deriving it.

## The two registries (`src/lib/data/data-definitions.ts`)

Every editable field is registered in two places:

- **`FIELD` enum** — the canonical string key for a top-level `Character`
  property. UI code passes `FIELD.x` around instead of bare strings.
- **`STANDARD_EDITABLE_FIELD_TYPES: Record<FIELD, FieldTypeNode>`** — maps each
  field to an _editor kind_ (`"string"`, `"number"`, `"formula"`, `"textLine"`,
  `"spell"`, `"attack"`, a custom kind, etc.). `FieldTypeNode` is the union of
  all editor kinds. A field with no entry throws `"Unsupported field type!"`
  when targeted.

`EDITABLE_FIELD_OPTIONAL_DATA` optionally supplies a nicer modal title/hint for
a field or dotted sub-path (e.g. `"stats.str"`).

## Targeting a field for edit (`src/lib/hooks/use-targeted-field.tsx`)

Editing is driven by a **stack** of `[FIELD, subField?]` pairs. `subField` is a
`.`-delimited path into the field's value (array indices included), e.g.
`"3.info.titleFormulas.0"`. The stack lets one editor open another (a list
editor → the formula builder) and return via the modal's back button.

- `pushTargetedField(field, subField?)` opens/descends an editor.
- `popTargetedField()` goes back one level; `clearTargetedField()` closes all.

## Routing a target to an editor (`src/components/charsheet.tsx`)

`CharSheet` watches the top of the stack. Its `useEffect` reads the field's
`STANDARD_EDITABLE_FIELD_TYPES` entry, then **disambiguates by `subField`** to a
concrete `modalType`, e.g.:

- formula sub-paths (`subField` contains `"Formulas"`, or names a formula leaf
  like `maxUses`) → `"formula"` (opens `BuildCustomFormula`).
- otherwise → the field's own editor kind.

A `switch (modalType)` below maps each kind to its editor component, wrapped in
`ModalContainer`. **Add both halves** (the `useEffect` branch and the `switch`
case) when introducing a new editor kind.

## The modal draft buffer (`src/components/modals/modal-container.tsx`)

`ModalContainer` runs its **own `useReducer`** seeded from the saved character,
and provides it via `CharacterContext`. So inside a modal, `useCharacter()`
returns the _draft_, and edits don't touch the real character until **`saveData`
(from `useSave()`)** copies the targeted field's draft value out to the outer
dispatch. Editors must call `saveData()` to persist.

## Editor component conventions

- Read the value with `getFieldValue(targetedField, character)` then
  `traverse(subField, …)`.
- Write leaf fields with `dispatch(updateData(field, { value }, `${subField}.key`))`.
  The reducer requires the **parent of a written path to already exist** — build
  nested objects wholesale if they may be absent.
- Reuse `ControlledEditTextLine` (`src/components/edit-text-line.tsx`) for any
  `TextComponent` (title + optional detail, both with positional `{{}}`
  formulas). `EditSpell` and `EditLimitedUseAbility` are the reference examples.
- **`BuildCustomFormula` only renders if the formula already exists.** For a list
  of items each holding a formula, the "add" button opens the editor on the next
  (not-yet-created) index without writing anything, and the editor **seeds a
  default item into the modal draft** on mount (see the `useEffect` in `EditSpell`
  / `EditLimitedUseAbility`). Because the seed lives only in the draft, nothing is
  persisted until the user saves and backing out discards it. Seed by replacing
  the whole bucket array with `preSeedList.concat(default)` so the effect is
  idempotent under StrictMode's double-invoke. (Simple text-line lists like
  `MultiLineTextDisplay` need no seed — `EditTextLine` just falls back to a blank
  `TextComponent` when the index is empty, since it writes the whole object.)

## Displaying a value

Read-only/edit-trigger display components live in `src/components/display/`.
Common pieces: `SingleValueDisplay`, `MultiLineTextDisplay` (a `TextComponent`
list), `TextWithFormulasDisplay` (renders a `{{}}` template + formulas),
`ComponentWithPopover` (hover/pin detail), `SlotPips` (expendable pips). They get
the reactive character from `useCharacter()` and trigger edits via
`pushTargetedField`.
