# The formula engine

Computed sheet values — AC, HP, attack bonuses, save DCs, limited-use counts —
are not stored as numbers. They're stored as **formula trees** that reference
the character (its stats, class levels, proficiency bonus) and are evaluated on
demand. This is what lets a homebrew AC of "13 + dex mod, between 10 and 18"
recompute itself when the character's Dexterity changes, with no recalculation
plumbing on the field. The engine lives in `src/lib/formula.ts`; the data shapes
it operates on are in `src/lib/types.ts`.

## The data model (`types.ts`)

A `CustomFormula` is a recursive union — either a leaf or an operation node:

- **`AtomicVariable`** (leaf) — `number` | `StatKey` | `ClassName` | `PB` |
  `DieExpression`. A leaf is either a literal constant or a _symbolic reference_
  into the character: a `StatKey` resolves to that stat's modifier, a
  `ClassName` to the level in that class, `PB` to proficiency bonus, a
  `DieExpression` (`[count, die, DieOperation]`) to e.g. its average value.
- **`Expression`** (node) — an `operation` plus operands. Three operand arities,
  each with its own type guard: single (`ceil`, `floor`), double
  (`subtraction`, `division` — order matters), and arbitrary
  (`addition`, `multiplication`, `minimum`, `maximum`). `calculate*`/`format*`
  branch on these guards to read operands the right way.

`CustomFormulaWithDamage` is a `DamageType → CustomFormula` map (an attack that
deals "1d8 slashing + 2 fire" is two formulas), and a `TextComponent` carries a
`titleFormulas: CustomFormula[]` array whose values fill positional `{{}}` slots
in prose. **Whenever a new field needs a computed value, reuse `CustomFormula`
rather than inventing a bespoke calc path** — every consumer below comes for
free.

## Two passes over one tree: calculate and format

The engine walks the same tree two ways, and keeping them separate is the
central design decision:

- **`calculateCustomFormula(formula, character) → number`** resolves every
  symbolic leaf against the character and folds the tree to a single number.
  This is the value shown on the sheet.
- **`formatCustomFormula(formula, character, evaluateReferences?) → string`**
  renders the tree as human-readable prose. With `evaluateReferences: false`
  (the builder/preview mode) symbolic leaves stay symbolic — "dex mod", "PB",
  "Wizard level" — so the user sees the _structure_ they authored. With it
  `true` (the default) references collapse to their current numbers, for a
  read-only explanation of where a total came from.

The single `AtomicVariable` union is what unifies these: `calculate*` and
`format*` both switch on the same guards (`isStatKey`, `isPb`, `isClassName`,
…), so adding a new leaf kind means teaching both passes one new case and
nothing else.

## The formatter is structural, not string-concatenation

`format*` returns `FormattedPart` objects (`{ text, precedence, numericValue? }`),
not bare strings, and that carried context is what makes the output read like
math a person wrote rather than a literal transcription of the tree:

- **Precedence-aware parenthesization.** Each operator declares a precedence;
  parents wrap a child only when it binds more loosely (`paren`), with a stricter
  rule on the right of non-associative operators so `a - (b - c)` stays correct.
- **Constant folding.** A subtree with no symbolic leaves collapses to one
  `numberPart`; additive/multiplicative nodes further fold their constant terms
  together (`a + 2 + 3` → `a + 5`) and flip negative terms to subtraction.
- **Idiom recognition.** `asClamp` detects the `max(lo, min(hi, x))` shape and
  prints it as "x, between lo and hi"; anything that isn't a clamp falls back to
  functional `min(...)`/`max(...)`.

These are display concerns only — none of it affects `calculate*`, which just
runs each operator's `calculator`. `OPERATORS` is the single table pairing every
`Operation` with its numeric `calculator`, its `precedence`, and its display
`format`; `EDITOR_SYNTAX` is a deliberately separate table for the formula
builder's inline chrome, so the polished display vocabulary and the raw-structure
builder vocabulary can diverge without fighting.

## Invariants worth preserving

- **Formulas are pure functions of `(formula, character)`** — no ambient state,
  no caching. That's why they're the main unit-tested surface (`utils.test.ts`)
  and safe to call freely during render.
- **Every `AtomicVariable` case must be handled in both passes.** The final
  `throw "unreachable"` in each switch is the tripwire for a leaf kind added to
  the type but not the engine.
- **Adding an operator** means one new `OPERATORS` entry (calculator +
  precedence + format), one `EDITOR_SYNTAX` entry, and — if it needs a new
  arity — a new operand-shape guard in `types.ts`. Don't special-case operators
  inside `calculate*`/`format*`; drive everything through the tables.
