import {
  FIELD,
  FieldTypeNode,
  STANDARD_EDITABLE_FIELD_TYPES,
  StatKey,
} from "src/lib/data/data-definitions";

// ---------------------------------------------------------------------------
// Which editor a targeted field opens.
//
// A field's `STANDARD_EDITABLE_FIELD_TYPES` entry is the default, but many
// fields have sub-paths that need a *different* editor — a formula leaf inside
// an attack, the SRD browser instead of a blank spell, the consolidated skills
// editor behind the "Skills" heading.
//
// This used to be a ten-branch if/else chain inside `charsheet.tsx`'s effect,
// paired with a switch that mapped the result to a component. The two halves
// had to be edited together (the docs said so in bold), and the routing bug
// where a limited-use ability's save-DC path reopened the ability editor
// instead of the formula builder shipped exactly because of that. Extracting
// the decision makes it a pure function with a table of rules, testable
// without rendering anything.
// ---------------------------------------------------------------------------

/** A routing rule: when it matches, the field opens `type`. First match wins. */
interface Route {
  /** Why this rule exists — surfaced in test failures. */
  name: string;
  when: (ctx: RouteContext) => boolean;
  type: FieldTypeNode | ((ctx: RouteContext) => FieldTypeNode);
}

export interface RouteContext {
  field: FIELD;
  /** The field's default editor kind. */
  fieldType: FieldTypeNode;
  /** Dot-path into the field's value; "" when the whole field is targeted. */
  subField: string;
  /** `subField` split on ".", for the rules that care about position. */
  parts: string[];
}

// A `{{}}` formula slot inside a TextComponent, wherever it appears.
const isFormulaSlot = (ctx: RouteContext) => ctx.subField.includes("Formulas");

const ROUTES: Route[] = [
  {
    name: "attacks/new opens the weapon picker, not a blank attack",
    when: (c) => c.fieldType === "attack" && c.subField === "new",
    type: "selectWeapon",
  },
  {
    name: "an attack's damage map opens the damage-aware formula builder",
    when: (c) =>
      c.fieldType === "attack" &&
      c.parts.length === 2 &&
      c.parts[1] === "formula",
    type: "formulaWithDamage",
  },
  {
    name: "any other sub-path of an attack is a plain formula (to-hit, save DC)",
    when: (c) => c.fieldType === "attack" && c.parts.length > 1,
    type: "formula",
  },
  {
    name: "a spellcasting class's sub-fields each have their own editor",
    when: (c) => c.fieldType === "spellcastingClass",
    type: (c) => {
      switch (c.parts[1]) {
        case "class":
          return "singleClass";
        case "abilityOverride":
          return StatKey;
        case "saveDcOverride":
        case "attackBonusOverride":
          return "formula";
        default:
          throw new Error(
            `Unexpected subfield for spellcasting class: ${c.subField}`,
          );
      }
    },
  },
  {
    name: "a per-skill bonus is a formula under the otherwise-boolean proficiencies",
    when: (c) =>
      c.field === FIELD.proficiencies && c.subField.startsWith("skillBonuses"),
    type: "formula",
  },
  {
    name: "the Skills heading opens the consolidated skills editor",
    when: (c) => c.field === FIELD.proficiencies && c.subField === "skills",
    type: "editSkills",
  },
  {
    name: "armor proficiencies are a checkbox set",
    when: (c) => c.fieldType === "otherProficiencies" && c.parts[0] === "armor",
    type: "armorProficiencies",
  },
  {
    name: "tools are text lines, with formula slots like any other",
    when: (c) =>
      c.fieldType === "otherProficiencies" && c.parts[0] === "toolsAndOther",
    type: (c) => (isFormulaSlot(c) ? "formula" : "textLine"),
  },
  {
    name: "languages and weapons are plain strings",
    when: (c) => c.fieldType === "otherProficiencies",
    type: "string",
  },
  {
    name: "an equipment item's formula slots open the formula builder",
    when: (c) => c.fieldType === "equipment" && isFormulaSlot(c),
    type: "formula",
  },
  {
    name: "a limited-use ability's formula leaves: title/detail, maxUses, save DC",
    when: (c) =>
      c.fieldType === "limitedUseAbility" &&
      (isFormulaSlot(c) ||
        c.subField.endsWith("maxUses") ||
        c.subField.endsWith("save.dc")),
    type: "formula",
  },
  {
    name: "spells/<level>.new opens the SRD browser, mirroring attacks/new",
    when: (c) => c.fieldType === "spell" && c.subField.endsWith(".new"),
    type: "selectSpell",
  },
  {
    name: "formula slots in text lines and spells open the formula builder",
    when: (c) =>
      (c.fieldType === "textLine" || c.fieldType === "spell") &&
      isFormulaSlot(c),
    type: "formula",
  },
];

/**
 * The editor a targeted field + sub-path opens.
 *
 * Falls back to the field's own `STANDARD_EDITABLE_FIELD_TYPES` entry when no
 * rule matches — which is the common case, and why the rules only need to
 * describe the exceptions.
 */
export function resolveModalType(
  field: FIELD,
  subField?: string,
): FieldTypeNode {
  const fieldType = STANDARD_EDITABLE_FIELD_TYPES[field];
  if (!fieldType) throw new Error(`Unsupported field type: ${field}`);
  const sf = subField ?? "";
  const ctx: RouteContext = {
    field,
    fieldType,
    subField: sf,
    parts: sf === "" ? [] : sf.split("."),
  };
  const match = ROUTES.find((r) => r.when(ctx));
  if (!match) return fieldType;
  return typeof match.type === "function" ? match.type(ctx) : match.type;
}

// Exported for a test that asserts every rule is reachable, so a rule shadowed
// by an earlier one can't sit there looking load-bearing.
export const ROUTE_NAMES = ROUTES.map((r) => r.name);

export function matchedRouteName(
  field: FIELD,
  subField?: string,
): string | undefined {
  const fieldType = STANDARD_EDITABLE_FIELD_TYPES[field];
  const sf = subField ?? "";
  const ctx: RouteContext = {
    field,
    fieldType,
    subField: sf,
    parts: sf === "" ? [] : sf.split("."),
  };
  return ROUTES.find((r) => r.when(ctx))?.name;
}
