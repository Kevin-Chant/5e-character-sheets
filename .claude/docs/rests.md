# Rests: planning, variants, and the rest panel

Before this existed, `RechargeCriteria` was a **display label** — nothing
consumed it, so no pool, slot or hit die ever reset except by hand. Rests are
the layer that reads those labels and does the work.

## The planner is pure: `src/lib/rest.ts`

`planRest(character, kind, rules, options?)` returns a **`RestPlan`** and
dispatches nothing:

| Field                                | What it carries                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `updates`                            | The writes, as ordinary whole-value `update_*` actions                       |
| `changes` / `unchanged`              | `RestChange[]` — the human account of what the rest does and notably doesn't |
| `followUps`                          | The parts the _player_ drives (see below)                                    |
| `hitDiceRecovered` / `hitDiceBudget` | The dice handed back, and how many were allowed                              |
| `duration`                           | The label for the table's pacing variant                                     |

Purity is the point: the panel can **preview** a rest before committing it, and
the same plan renders as the receipt afterwards. If you add a rest effect, add it
to `planRest` — never to a component — and it gets the preview, the receipt, live
sync and undo for free.

### Committing: one action, not twelve

`applyRestPlan(character, plan)` folds the updates into a new character so the
panel can dispatch a single `replace_character`. This is deliberate and matches
the level-up wizard: a long rest touches a dozen fields, and undo is per-action,
so N updates would mean N presses of Ctrl+Z to unwind a mis-clicked rest.

**Hit dice spending is the exception** — each roll dispatches on its own, so a
bad roll can be undone without unwinding the rest around it.

### Recharge matching is textual, on purpose

`rechargesOnRest(recharge, kind)` lowercases and substring-matches, because
`RechargeCriteria = RestType | string` is deliberately open: the presets are
`"Short Rest"`/`"Long Rest"`, the feat catalog writes `"short"`/`"long"`, feature
prose says "a short or long rest", and homebrew writes whatever it likes.

- contains "short" → recharges on **either** rest (that's how 5e words every
  short-rest feature)
- contains "long" → long rest only
- anything else ("Dawn", "Initiative") → **not touched**, and reported as a
  `manualRecharge` follow-up so the player decides rather than the sheet guessing
- …except when the table says the rest **spans dawn**
  (`PlanRestOptions.spansDawn`, a checkbox on the rest fork offered only when
  something on the sheet listens for dawn): then pools matching the `dawn`
  trigger (`matchesTrigger` from `play/triggers.ts`) come back with the rest,
  on either rest kind — spanning dawn is a fact about the fiction, not the
  rest's length.

A pool restores **everything** when its trigger fires unless it carries a
`restore` formula (`LimitedUseAbility.restore`, optional) — the
"regains 1d3 expended charges daily at dawn" magic-item pattern. Both planners
roll it through `rollPoolRestore` (`mechanics/resolve.ts`), clamp to what was
spent, and say "(rolled)" in the receipt when dice decided the number.

### Follow-ups: what the planner won't decide

`RestFollowUp` is the contract between the planner and the UI for the
interactive parts — `spendHitDice`, `prepareSpells` (one per prepared-caster
class), `manualRecharge`. They are **not** in `updates`, which is why the panel
commits the ledger _first_ and then runs them against the rested sheet: under
Slow Natural Healing the dice a long rest hands back are spendable in the same
rest, so the order is forced by the rules.

## Variants live in settings (Game tab)

`RestRules` is the slice of `Settings` the planner reads, and `Settings`
satisfies it structurally — pass `settings` straight through. The Game settings
tab (`src/components/settings/game-settings.tsx`) owns these plus the other
table-agreement settings (crits, ammo, encumbrance):

| Setting                      | RAW default | Alternatives                                     |
| ---------------------------- | ----------- | ------------------------------------------------ |
| `restVariant`                | `standard`  | `epic`, `gritty` — **labels only**, no mechanics |
| `longRestHitDiceRecovery`    | `half`      | `all` (the common house rule), `none`            |
| `longRestHpRecovery`         | `full`      | `none` — Slow Natural Healing                    |
| `longRestExhaustionRecovery` | `one`       | `all`, `none`                                    |
| `longRestClearsTempHp`       | `true`      |                                                  |
| `promptSpellPreparation`     | `true`      |                                                  |

Hit dice recovery is "half your **total**, minimum one, capped at what you
spent" — note it's half the total, not half the remaining.

## The panel: `src/components/rest/`

Entry point is a bed button in the HP box's `corner-action` slot
(`defence-and-equipment-panel.tsx`), the same affordance level-up uses on
Class & Level.

`rest-dialog.tsx` is **two phases, not a wizard** — a rest's tasks don't gate
each other the way level-up's choices do, so steps would misrepresent it:

1. **The fork is the preview.** Two cards, each showing its own rest's headline
   effects, so the choice is never blind and no separate review step is needed.
   `forkLines` adds the hit-dice follow-up to the card's list — a short rest for
   a hurt character restores nothing _automatically_, and a card reading "Nothing
   to restore" would be wrong about the most useful thing it does.
2. **The workspace.** `rest-ledger.tsx` before and after the commit (forecast →
   receipt, markers switching ◆ → ✓), then the tasks. `RestWorkspace` puts the
   tasks _above_ the ledger when `changes` is empty, so a rest that restored
   nothing automatically doesn't open with a "Stays spent" list that reads as a
   failure report.

Two details worth keeping:

- The ledger's `omit` prop drops the `hp` entry while the tray is showing. The
  tray owns the HP story; a ledger line still saying "21/56 — spend hit dice" next
  to a tray that already healed you to 33 is a stale duplicate.
- `hit-dice-tray.tsx` exposes only the **first** ready token of each size to
  assistive tech (`aria-hidden`/`tabIndex={-1}` on the others). Every token of a
  size does the same thing, so six identical buttons would be six tab stops and
  six identical announcements for one action.

Colour follows the sheet's existing semantic map rather than inventing a
good/bad axis: the hit dice tray is crimson (`--health*`, life), the prepared-
spells task is amethyst (`--arcane*`, magic), and restored-vs-withheld is
carried by **marker and ink weight only**.

## Testing

`src/lib/rest.test.ts` covers the planner (30 tests: recharge matching, the
variants, budgets/allocation, both rest kinds, `applyRestPlan`).
`src/components/rest/rest-dialog.test.tsx` covers the flow — the fork's copy,
that previewing dispatches nothing, that committing is exactly one
`replace_character`, and that a die roll writes HP + expended dice.
