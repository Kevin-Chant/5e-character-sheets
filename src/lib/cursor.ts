import { FIELD } from "src/lib/data/data-definitions";
import { Character, CustomFormula } from "src/lib/types";
import { updateData, UpdateAction } from "src/lib/hooks/reducers/actions";

// A phantom-typed pointer into the `Character` tree: an array of path
// segments, typed by the value the path points at so `.k()`/`.at()`
// type-check both traversal and (via `updateAt`) the written value.
//
// Serializes to the same dot-path strings the pipeline already uses:
// `charPath(FIELD.attacks).at(0).k("name").subpath()` === "0.name",
// `.root()` === FIELD.attacks. WAMP wire format, undo/redo and modal-routing
// string checks stay untouched.
export class Cursor<T> {
  // Never assigned; makes `Cursor<T>` covariant in `T` so `this`-polymorphic
  // `at`/`append` can widen an array cursor to its element type.
  private readonly _phantom?: T;

  constructor(private readonly segments: ReadonlyArray<string | number>) {}

  // Struct/record key access, including `Record<enum, V>` maps (SpellSlots,
  // Proficiencies, CoinAmounts, HitDice, Spells buckets).
  // The `this` guard cuts recursion at `CustomFormula`: formulas swap whole
  // rather than being descended into, so `.k()` on `Cursor<CustomFormula>` is
  // a compile error. Numeric keys (spell-level buckets) serialize the same way.
  k<K extends keyof NonNullable<T> & (string | number)>(
    this: NonNullable<T> extends CustomFormula ? never : Cursor<T>,
    key: K,
  ): Cursor<NonNullable<T>[K]> {
    return new Cursor([...this.segments, key]);
  }

  // Array element access; `this`-typed so it stays available on
  // `Cursor<E[] | undefined>` buckets.
  at<E>(this: Cursor<readonly E[] | undefined>, index: number): Cursor<E> {
    return new Cursor([...this.segments, index]);
  }

  // "Create new" sentinel: serializes to the literal segment "new" (matching
  // the magic string charsheet.tsx detects); replaced with a real index via
  // `.at(newIndex)` after creation.
  append<E>(this: Cursor<readonly E[] | undefined>): Cursor<E> {
    return new Cursor([...this.segments, "new"]);
  }

  // The first segment is always a top-level FIELD.
  root(): FIELD {
    return this.segments[0] as FIELD;
  }

  // Dot-path after the FIELD root, as `Action.subField` expects; `undefined`
  // for a bare top-level field.
  subpath(): string | undefined {
    const rest = this.segments.slice(1);
    return rest.length ? rest.join(".") : undefined;
  }

  // Full dot-path including the FIELD root, e.g. "attacks.0.name".
  toString(): string {
    return this.segments.join(".");
  }
}

// Root a cursor at a top-level character field. FIELD ⊆ keyof Character
// (enforced by the static assertion in types.ts).
export function charPath<K extends FIELD>(field: K): Cursor<Character[K]> {
  return new Cursor([field]);
}

// Unchecked downcast from the string-typed targeted-field stack (`[FIELD,
// subField?]`) back into the typed cursor world; the calling editor knows the
// concrete type at that path.
export function fromStack<T>(
  field: FIELD,
  subField: string | undefined,
): Cursor<T> {
  const segments: (string | number)[] = [field];
  if (subField) segments.push(...subField.split("."));
  return new Cursor<T>(segments);
}

// Same as `updateData(cursor.root(), { value }, cursor.subpath())`, but with
// `value` type-checked against the cursor's leaf type.
export function updateAt<T>(cursor: Cursor<T>, value: T): UpdateAction {
  return updateData(cursor.root(), { value }, cursor.subpath());
}

// Clear an optional leaf (dispatch `{ value: undefined }`); separate from
// `updateAt` so it works even when `T` doesn't include `undefined` (see
// edit-hit-dice.tsx).
export function clearAt<T>(cursor: Cursor<T>): UpdateAction {
  return updateData(cursor.root(), { value: undefined }, cursor.subpath());
}
