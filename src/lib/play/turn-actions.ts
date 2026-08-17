import { CastingTime, LeveledSpellLevel } from "src/lib/data/data-definitions";
import { mechanicsForAbility } from "src/lib/mechanics/catalog";
import {
  availableSpellSlots,
  classNameForId,
  expendedPactSlots,
  getPactSlotInfo,
  isPreparedCaster,
} from "src/lib/rules";
import {
  AbilityAction,
  ActionCost,
  Attack,
  Character,
  LimitedUseAbility,
  Spell,
} from "src/lib/types";

// Pure projection that regroups a character's attacks/spells/pools by action
// economy (`ActionCost`) instead of by kind, for the play surface's turn board.
// Nothing here decides whether an action is legal — see `available`.

export const TURN_GROUP_ORDER: ActionCost[] = [
  "action",
  "bonusAction",
  "reaction",
  "free",
  "special",
];

// Headings for the board (not `ACTION_COST_LABELS`, which labels a badge).
export const TURN_GROUP_LABELS: Record<ActionCost, string> = {
  action: "Action",
  bonusAction: "Bonus Action",
  reaction: "Reaction",
  free: "Free",
  special: "Outside a turn",
};

interface TurnActionBase {
  key: string; // React key, stable within one render
  name: string;
  cost: ActionCost;
  note?: string; // timing/condition prose, never load-bearing
  // Whether the needed resource is in hand. Advisory only — dims, doesn't
  // disable, since the sheet can't see the whole table.
  available: boolean;
}

export type TurnAction =
  | (TurnActionBase & { kind: "attack"; index: number; attack: Attack })
  | (TurnActionBase & {
      kind: "spell";
      level: number;
      index: number;
      spell: Spell;
    })
  | (TurnActionBase & {
      kind: "ability";
      abilityIndex: number;
      ability: LimitedUseAbility;
      action: AbilityAction;
    });

// Actions every character has just by being in a fight; not on the character
// model. Reference only — nothing here rolls or spends.
export const STANDARD_ACTIONS: Record<string, string[]> = {
  action: [
    "Dodge",
    "Dash",
    "Disengage",
    "Hide",
    "Help",
    "Search",
    "Ready",
    "Use an Object",
    "Grapple",
    "Shove",
  ],
  reaction: ["Opportunity Attack"],
};

// `Spell.castingTime` is `CastingTime | string`: the three action-economy
// values match exactly, everything else ("1 minute", "1 reaction, which you
// take when...") is free text and falls to `special`.
export function normalizeCastingTime(castingTime: string | undefined): {
  cost: ActionCost;
  note?: string;
} {
  // Missing casting time = hand-authored spell; default to action (the
  // majority case, 242/319 SRD spells), not a slow guess.
  if (!castingTime) return { cost: "action" };
  const text = castingTime.trim();
  const lower = text.toLowerCase();
  if (lower === CastingTime.Action) return { cost: "action" };
  if (lower === CastingTime.BonusAction) return { cost: "bonusAction" };
  if (lower.startsWith(CastingTime.Reaction)) {
    const trigger = text
      .slice(CastingTime.Reaction.length)
      .replace(/^,\s*/, "");
    return { cost: "reaction", note: trigger || undefined };
  }
  return { cost: "special", note: text };
}

// Pact slots are a separate fixed-level pool, checked in addition to ordinary
// slots of the same level.
function hasSlotFor(character: Character, level: number): boolean {
  if (level === 0) return true;
  if (availableSpellSlots(character, level as LeveledSpellLevel) > 0) {
    return true;
  }
  const pact = getPactSlotInfo(character);
  const pactLevel = character.pactSlots?.levelOverride ?? pact.level;
  const pactTotal = character.pactSlots?.totalOverride ?? pact.total;
  return pactLevel >= level && pactTotal - expendedPactSlots(character) > 0;
}

// Prepared casters cast from today's prepared list; known casters cast their
// whole repertoire. Cantrips are always available. An unprepared spell dims
// rather than disappearing, so the board doesn't look broken/empty.
function isPrepared(
  character: Character,
  spell: Spell,
  level: number,
): boolean {
  if (level === 0) return true;
  const className = classNameForId(character, spell.spellcastingClass);
  if (!className || !isPreparedCaster(className)) return true;
  return !!spell.prepared;
}

// Every action the character could take, grouped by cost. Order within a
// group follows the sheet: attacks, then spells by level, then pools.
export function turnActions(character: Character): TurnAction[] {
  const actions: TurnAction[] = [];

  // Attacks have no stored action cost; all default to "action" (off-hand
  // two-weapon attacks are a bonus action the player accounts for themselves).
  character.attacks.forEach((attack, index) => {
    actions.push({
      kind: "attack",
      key: `attack:${attack.id}`,
      name: attack.name,
      cost: "action",
      available: true,
      index,
      attack,
    });
  });

  Object.entries(character.spells).forEach(([levelKey, spells]) => {
    const level = Number(levelKey);
    (spells ?? []).forEach((spell, index) => {
      const { cost, note } = normalizeCastingTime(spell.castingTime);
      const prepared = isPrepared(character, spell, level);
      actions.push({
        kind: "spell",
        key: `spell:${level}:${index}`,
        name: spell.info.title,
        cost,
        note: !prepared ? "not prepared" : note,
        available: prepared && hasSlotFor(character, level),
        level,
        index,
        spell,
      });
    });
  });

  // One row per `AbilityAction` (a Ki pool is several distinct actions).
  character.limitedUseAbilities.forEach((ability, abilityIndex) => {
    const abilityActions = mechanicsForAbility(ability)?.actions ?? [];
    abilityActions.forEach((action) => {
      actions.push({
        kind: "ability",
        key: `ability:${abilityIndex}:${action.id}`,
        name: action.name,
        cost: action.cost,
        note: action.costNote,
        // `ActionRow` computes its own enablement (pool empty, etc).
        available: true,
        abilityIndex,
        ability,
        action,
      });
    });
  });

  return actions;
}

export function groupByCost(
  actions: TurnAction[],
): Record<ActionCost, TurnAction[]> {
  const groups: Record<ActionCost, TurnAction[]> = {
    action: [],
    bonusAction: [],
    reaction: [],
    free: [],
    special: [],
  };
  actions.forEach((action) => groups[action.cost].push(action));
  return groups;
}
