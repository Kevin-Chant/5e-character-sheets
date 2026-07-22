import { FIELD } from "src/lib/data/data-definitions";
import { Character, CustomFormula } from "src/lib/types";
import { updateData, UpdateAction } from "src/lib/hooks/reducers/actions";

// A phantom-typed pointer into the `Character` tree. It carries no runtime data
// beyond an array of path segments; the type parameter `T` tracks the type of
// the value the path currently points at, so `.k()` / `.at()` type-check both
// the traversal *and* (via `updateAt`) the value written there.
//
// Crucially, a cursor serializes to exactly the dot-path strings the pipeline
// already uses: `charPath(FIELD.attacks).at(0).k("name").subpath()` === "0.name"
// and `.root()` === FIELD.attacks. So the wire format (WAMP), undo/redo, and the
// modal-routing string checks in charsheet.tsx are all untouched — cursors only
// replace hand-assembled template strings at the authoring/dispatch sites.
export class Cursor<T> {
  // Never assigned. Its sole purpose is to make `Cursor<T>` *covariant* in `T`,
  // so the `this`-polymorphic `at`/`append` methods can widen an array cursor to
  // its element type. Without it, `T` appearing in method parameter positions
  // would make the class invariant and those `this` annotations wouldn't match.
  private readonly _phantom?: T;

  constructor(private readonly segments: ReadonlyArray<string | number>) {}

  // Struct / record key access. Works for `Record<enum, V>` maps too
  // (SpellSlots, Proficiencies<SkillName>, CoinAmounts, HitDice, the Spells
  // buckets) since `keyof Record<K, V>` is `K`. `NonNullable` sees through
  // optional fields (`pactSlots?`, `Spells[level]?: Spell[]`).
  //
  // The `this` guard cuts the recursion at `CustomFormula`: formula slots are
  // reached (`titleFormulas.2`) but never descended *into* (formulas swap
  // whole), so `.k()` on a `Cursor<CustomFormula>` is a compile error.
  // Keys may be strings or numbers — the numeric spell-level buckets (`Spells`,
  // `SpellSlots`) are keyed by number, and a number serializes into the dot-path
  // identically (`spellSlots.1.expended`) and indexes the object at runtime.
  k<K extends keyof NonNullable<T> & (string | number)>(
    this: NonNullable<T> extends CustomFormula ? never : Cursor<T>,
    key: K,
  ): Cursor<NonNullable<T>[K]> {
    return new Cursor([...this.segments, key]);
  }

  // Array element access. Written with a `this` type rather than constraining
  // `T` so it stays available on `Cursor<E[] | undefined>` buckets.
  at<E>(this: Cursor<readonly E[] | undefined>, index: number): Cursor<E> {
    return new Cursor([...this.segments, index]);
  }

  // The "create new" sentinel. Serializes to the literal segment "new", matching
  // today's magic strings ("new" for attacks, detected in charsheet.tsx); the
  // swap-after-create step then replaces the sentinel with a real index via
  // `.at(newIndex)`.
  append<E>(this: Cursor<readonly E[] | undefined>): Cursor<E> {
    return new Cursor([...this.segments, "new"]);
  }

  // The first segment is always a top-level FIELD.
  root(): FIELD {
    return this.segments[0] as FIELD;
  }

  // The dot-path *after* the FIELD root — what `Action.subField` carries. An
  // empty tail (a bare top-level field) is `undefined`, matching `updateData`'s
  // optional `subField`.
  subpath(): string | undefined {
    const rest = this.segments.slice(1);
    return rest.length ? rest.join(".") : undefined;
  }

  // The full dot-path including the FIELD root, e.g. "attacks.0.name".
  toString(): string {
    return this.segments.join(".");
  }
}

// Root a cursor at a top-level character field. `Character[K]` resolves because
// FIELD ⊆ keyof Character (enforced by the static assertion in types.ts).
export function charPath<K extends FIELD>(field: K): Cursor<Character[K]> {
  return new Cursor([field]);
}

// The editors' single documented *unchecked* downcast from the string-typed
// targeted-field stack back into the typed cursor world. The stack stores
// `[FIELD, subField?]` for modal routing; an editor knows (by which modal it is)
// the concrete type living at that path and asserts it here. Same trust level as
// today's untyped `traverse(subField, character)` reads — concentrated in one
// line per editor instead of spread across every dispatch.
export function fromStack<T>(
  field: FIELD,
  subField: string | undefined,
): Cursor<T> {
  const segments: (string | number)[] = [field];
  if (subField) segments.push(...subField.split("."));
  return new Cursor<T>(segments);
}

// Dispatch-boundary erasure: produces the identical `UpdateAction` that
// `updateData(cursor.root(), { value }, cursor.subpath())` would, but with the
// value type-checked against the cursor's leaf type.
export function updateAt<T>(cursor: Cursor<T>, value: T): UpdateAction {
  return updateData(cursor.root(), { value }, cursor.subpath());
}

// Clear an optional leaf (dispatch `{ value: undefined }`), for the editors that
// unset optional overrides. Separate from `updateAt` so it's usable even where
// the leaf type `T` doesn't include `undefined` (see edit-hit-dice.tsx).
export function clearAt<T>(cursor: Cursor<T>): UpdateAction {
  return updateData(cursor.root(), { value: undefined }, cursor.subpath());
}
