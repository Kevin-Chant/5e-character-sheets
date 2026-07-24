# Rolling dice during play

A reusable die button (`RollButton`, `src/components/roll-button.tsx`) sits next
to rollable formulas — attack damage and spells today — and opens a small roll
dialog. It's a **play-mode** action: `RollButton` returns null in edit mode, so
the die button takes the place of a row's edit/delete controls rather than adding
clutter (weapons and spells right-align it in the same slot those buttons use).

## Why it's a separate channel, not the edit modal

Two properties of the edit machinery make it the wrong host for rolling, and
together they drove the design:

1. **`pushTargetedField` is gated on `editMode`** (see
   `use-targeted-field.tsx`) — but you roll in play mode.
2. **`ModalContainer` is edit-shaped** — it spins up a _draft_ character reducer
   and its `saveData` is keyed on the current targeted field. Rolling writes
   nothing.

So rolling gets its own tiny context (`RollerProvider` / `useRoller`,
`src/lib/hooks/use-roller.tsx`) holding at most one `RollRequest`, and
`RollModal` reuses the modal **CSS** but not the component. Both are mounted once
inside `CharSheet`. (Contrast the SRD picker, which _is_ an edit action and
correctly rides the targeted-field stack.)

## The random evaluator is separate from the engine

`calculateCustomFormula` must stay deterministic — it runs on every render, and
its `roll` `DieOperation` is a fixed stub. Real randomness lives in
`src/lib/roll.ts`, invoked **only** on a Roll click:

- `rollFormula` / `rollDamage` walk the same `CustomFormula` tree but roll each
  `DieExpression` randomly, resolving every non-die leaf (stats, PB, class level,
  `spellMod`) through the engine's `calculateAtomicVariable` and reusing
  `OPERATORS` for the arithmetic — so a rolled result composes exactly like the
  displayed formula, just with real dice. They collect the individual dice for
  the breakdown.
- `formatRollBreakdown(total, dice, crit?)` writes a result out as its parts —
  `"4 + 6 + 5"` rather than the old `"(4 + 6)"` against a total of 15, which left
  the reader to infer the modifier. The flat term is **derived** (`total` minus
  the dice) rather than tracked through the evaluator, which buys the property
  that matters: the parts always add up to the total shown. Under the `total`
  crit flavor the multiplier is factored out (`"(4 + 6 + 5) ×2"`) instead of
  being smuggled into the flat term. Every result line in the dialog uses it.
- `rollD20Check(modifier, mode)` handles d20 checks: one d20, or two keeping the
  higher (`advantage`) / lower (`disadvantage`), plus a flat modifier.

`formulaHasDice` / `damageHasDice` decide when a die button is worth showing.

## The three roll kinds (`RollSpec`)

`RollButton` takes props that resolve to one of three specs:

- **`check`** (a number) → `d20 + modifier`, with Disadv./Roll/Adv. buttons.
  Every "roll a d20 and add a number" surface.
- **`formula`** (a `CustomFormula`) → rolls its dice, display-only.
- **`hitDie`** (a `StandardDie`) → the one roll kind that **writes**: rolls
  `1d<die> + CON`, then an explicit Apply button heals current HP and marks one
  die expended. It's declarative (not an `afterRoll` callback) so the modal can
  gate on the live character: Roll disabled at zero remaining dice, healing
  clamped to max HP, and any minimum-total rider (Durable) applied. The apply
  step goes through the mechanics resolver (`resolveEffects` → normal
  `dispatch`es; see [`ability-mechanics.md`](./ability-mechanics.md)) —
  play-mode dispatching is fine, only the edit-modal machinery is off-limits.

Every roll consults the character's **riders** for its kind — rerolls, minimum
dice, crit range, minimums — via `ridersFor` (see
[`ability-mechanics.md`](./ability-mechanics.md)); `rollFormula`/`rollDamage`/
`rollD20Check` all take the active rider list.

For a weapon attack that list is then filtered by the weapon itself. The dialog
derives an `AttackContext` from `spec.attack` (the sheet entry the die button
came from) and runs every collected rider through `applicableRiders` /
`needsOptIn`: riders the weapon rules out are never shown, ones it settles apply
silently, and ones it can't settle stay a checkbox. `spec.attack` is deliberately
absent for a **spell** attack — a fighting style is a weapon feature, so leaving
a spell's context unknown correctly keeps Archery a prompt on Fire Bolt rather
than auto-applying it. See
[`ability-mechanics.md`](./ability-mechanics.md#weapon-conditions-requires-and-the-three-valued-answer).

- **`attack`** (from `toHit`/`save` and/or `damage`/`spell`) → **one dialog with
  both steps**: an optional _To Hit_ section (`d20 + toHit`, adv/dis) — or a
  read-only _Saving Throw_ section when the target rolls instead — above a
  _Damage_/_Healing_ section. This is why a weapon or attack-spell has a single
  die button — you click "I'm attacking with this" once and resolve both rolls
  in place.

## Attacks: to-hit + effect in one dialog

For an `attack` spec the modal renders:

- **To Hit** — shown when `toHit` is set (weapon attack bonus, or spell attack
  bonus via `getSpellAttackBonus`). A d20 check with advantage/disadvantage.
- **Saving Throw** — shown instead when `save` is set. Deliberately **not
  rollable**: the target's save is the DM's roll, so the section is read-only —
  the DC, what a success does, and any advisory note. The player still rolls
  damage once; the result line reports both outcomes ("Failed save: 12 —
  Successful save: 6") so nobody halves it by hand. A save-based attack also has
  no crit toggle, since there's no attack roll to crit.
- **Damage / Healing** — from a fixed `damage` map, or a `spell`'s
  `mechanics`. A `spell` adds a cast-level control: a slot-level `<select>`
  (base…9th) for leveled spells, or an automatic character-level note for
  cantrips. The chosen level runs through `spellDamageAtLevel` /
  `spellHealingAtLevel` (see [`spell-scaling.md`](./spell-scaling.md)) to expand
  scaling before rolling. Healing spells (Cure Wounds, Heal) render a "Roll
  Healing" button and an "N HP" result instead of per-type damage.

  The cast-level `<select>` lists **only levels the character has unspent slots
  for** (`availableSpellSlots`), at or above the spell's base level; with none it
  shows "No spell slots available" and disables rolling.

A spell with no structured `mechanics` (damage or healing) shows no die button.

## Critical hits

Crits are one of the most-house-ruled parts of 5e, so the flavor is a **setting**
(`criticalDamageMode`, plus the `explodingCriticals` toggle) rather than a
constant. `roll.ts` models it as a `CritSpec` (`{mode, extraSets?}`) passed into
`rollFormula`/`rollDamage`:

| `mode`    | Setting label                        | What a die leaf of `N` dice does            |
| --------- | ------------------------------------ | ------------------------------------------- |
| `raw`     | Double the damage dice (RAW)         | rolls `2N` dice; flat modifiers unchanged   |
| `maxDice` | Maximize the dice, then roll again   | `N` dice at max face value **+** `N` rolled |
| `total`   | Double the total, modifiers included | rolls `N` dice, then doubles the whole sum  |

Two structural points:

- `total` can't be applied per die leaf — it scales the modifiers too — so
  `rollFormula` is a thin wrapper that recurses via `rollNode` and multiplies
  once at the top. The other modes never touch the wrapper.
- The crit is a **roll-time argument, not a formula transform**: the stored
  damage expression and its `format*` display stay untouched, which is what lets
  the same `Attack` render normally and roll critically.

`extraSets` is exploding crits. `rollD20Check` takes an `explodeAt` threshold;
when the kept d20 crits it keeps rolling d20s until one doesn't, and each repeat
adds another set of critical dice (so `raw` + one repeat = triple dice, `total` +
one repeat = ×3). It never changes the check's own total, and a `MAX_EXPLOSIONS`
cap keeps a bad threshold from hanging the tab.

In the dialog, the two halves of an attack share the state: `CheckControls`
reports `(crit, explosions)` up to `RollModal`, which hands it to
`EffectControls`. The crit checkbox stays **manually overridable** — the sheet
can't see a paralyzed target or an assassin's surprise round — and un-ticking it
drops any exploding stack. Crit inflation covers the weapon/spell's own dice and
every `on-hit` `extraDamage` rider riding along (Sneak Attack, Divine Smite),
never healing, and never a save-based spell (no to-hit roll → no toggle).

## Where the button is wired

| Surface        | Component                                | Roll                                          |
| -------------- | ---------------------------------------- | --------------------------------------------- |
| Ability checks | `stat-display.tsx`                       | `check` = ability modifier                    |
| Saving throws  | `proficiency-display.tsx` (`rollLabel`)  | `check` = save modifier                       |
| Skills         | `proficiency-display.tsx` (`rollLabel`)  | `check` = skill modifier                      |
| Initiative     | `single-value-display.tsx` (`rollCheck`) | `check` = init modifier                       |
| Weapon attack  | `defence-and-equipment-panel.tsx`        | `attack` = to-hit + damage                    |
| Hit dice       | `defence-and-equipment-panel.tsx`        | `hitDie` = spend a die, heal HP               |
| Spells         | `spell-list.tsx`                         | `attack` = spell (+ to-hit for attack spells) |

Two reusable seams keep the wiring cheap: `ProficiencyDisplay`'s `rollLabel` and
`SingleValueDisplay`'s `rollCheck` add a d20 button to any row whose transformed
value is a modifier — so future check surfaces are a one-prop change.

Not yet wired: death saves (a `check` with modifier 0 and its own pass/fail
semantics) and spell **save-DC** display in the roll dialog (save spells roll
damage but don't yet surface "DC N" as a target).
