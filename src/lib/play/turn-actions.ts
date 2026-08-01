import { CastingTime, LeveledSpellLevel } from "src/lib/data/data-definitions";
import { mechanicsForAbility } from "src/lib/mechanics/catalog";
import {
  availableSpellSlots,
  classNameForId,
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

// The play surface's core question is "what can I do right now", and the answer
// is already on the character — it is just spread across three sections that
// group by *what kind of thing it is* (attacks, spells, pools) rather than by
// what it costs on your turn. This module is the projection that regroups them
// by action economy. It is pure and has no React in it, for the same reason the
// rest planner doesn't: the grouping rules are the part worth testing.
//
// Nothing here decides whether an action is *legal* — see `available`.

// The order groups are presented in: the shape of a turn, then the things that
// aren't part of one. `free` sits after `reaction` because it's a footnote in
// play, and `special` last because it's mostly long casts and rest abilities.
export const TURN_GROUP_ORDER: ActionCost[] = [
  "action",
  "bonusAction",
  "reaction",
  "free",
  "special",
];

// Headings for the board. Deliberately not `ACTION_COST_LABELS`: those label a
// badge sitting *beside* a button ("Bonus"), while these head a list and can
// afford the full noun. `special` is renamed outright — "Special" describes the
// enum, not what a player finds under it.
export const TURN_GROUP_LABELS: Record<ActionCost, string> = {
  action: "Action",
  bonusAction: "Bonus Action",
  reaction: "Reaction",
  free: "Free",
  // Covers both ends of "not part of a turn": a 10-minute ritual and a
  // short-rest ability land here together, and "Special" (the enum's word)
  // describes neither to a player.
  special: "Outside a turn",
};

interface TurnActionBase {
  // Stable within one character render — used as the React key.
  key: string;
  name: string;
  cost: ActionCost;
  // Timing or condition prose shown after the name ("when you take damage",
  // "1 minute"). Never load-bearing.
  note?: string;
  // Whether the resource this needs is in hand — a spell with no slot left, a
  // pool that's empty. Advisory: the row dims, it does not disable. The sheet
  // can't see the whole table (a scroll, a friendly cleric, a DM's ruling), so
  // it states what it knows and lets the player decide.
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

// The actions every character has by virtue of being in a fight. They aren't on
// the character model and never will be, but leaving them off the board would
// make it lie about what a turn offers — a new player's most common question is
// "can I do anything other than attack?", and the answer is a list they've never
// been shown. Reference only: nothing here rolls or spends.
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

// `Spell.castingTime` is `CastingTime | string`: the catalog importer writes the
// three action-economy values exactly, and everything else is free text
// ("1 minute", "1 reaction, which you take when a creature falls"). Matching the
// enum first and prefix-matching the reaction case covers the whole bundled
// catalog; anything else falls to `special` with its own text rather than being
// guessed into a turn it doesn't fit.
export function normalizeCastingTime(castingTime: string | undefined): {
  cost: ActionCost;
  note?: string;
} {
  // An absent casting time means a hand-authored spell, not a slow one. Action
  // is both the overwhelming majority (242 of 319 in the SRD) and the harmless
  // guess: the board's job is to surface the spell, not to adjudicate it.
  if (!castingTime) return { cost: "action" };
  const text = castingTime.trim();
  const lower = text.toLowerCase();
  if (lower === CastingTime.Action) return { cost: "action" };
  if (lower === CastingTime.BonusAction) return { cost: "bonusAction" };
  if (lower.startsWith(CastingTime.Reaction)) {
    // "1 reaction, which you take when …" — the trigger is the useful half.
    const trigger = text
      .slice(CastingTime.Reaction.length)
      .replace(/^,\s*/, "");
    return { cost: "reaction", note: trigger || undefined };
  }
  return { cost: "special", note: text };
}

// Whether a spell of this level has something left to cast it with. Pact slots
// are a separate pool at a fixed level, so a warlock's 3rd-level spell is
// castable while pact slots remain even with every ordinary 3rd-level slot gone.
function hasSlotFor(character: Character, level: number): boolean {
  if (level === 0) return true;
  if (availableSpellSlots(character, level as LeveledSpellLevel) > 0) {
    return true;
  }
  const pact = getPactSlotInfo(character);
  const pactLevel = character.pactSlots?.levelOverride ?? pact.level;
  const pactTotal = character.pactSlots?.totalOverride ?? pact.total;
  return (
    pactLevel >= level && pactTotal - (character.pactSlots?.expended ?? 0) > 0
  );
}

// Prepared casters cast from what they prepared today; known casters cast their
// whole repertoire. Cantrips are always on, for both.
//
// An unprepared spell **dims rather than disappearing**. Hiding it was the first
// implementation and it was wrong in the most visible way possible: a 9th-level
// wizard who hasn't ticked anything as prepared got a board holding three
// cantrips, which reads as a broken app rather than as an empty spell list. The
// board's job is to show you what you have and tell you what's true about it.
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

// Every action the character could take, grouped by what it costs. Order within
// a group follows the sheet — attacks, then spells by level, then pools — so a
// player who knows where something lives on the sheet meets it in the same
// relative order here.
export function turnActions(character: Character): TurnAction[] {
  const actions: TurnAction[] = [];

  // Weapon attacks. `Attack` carries no action cost, and adding one would be a
  // schema change for a field that is "action" on all but the off-hand attack of
  // a two-weapon fight — which depends on what you did with your Action, not on
  // the weapon. So: Action, and the player moves the bonus one themselves.
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
        // Why it's dimmed comes first — "no slots left" is the answer to the
        // question the dimming raises, and the casting-time prose isn't.
        note: !prepared ? "not prepared" : note,
        available: prepared && hasSlotFor(character, level),
        level,
        index,
        spell,
      });
    });
  });

  // Pools contribute one row per `AbilityAction` — a Ki pool is three separate
  // things you can do, at two different costs, and collapsing them to "Ki" is
  // exactly the flattening the sheet already does and the board exists to undo.
  character.limitedUseAbilities.forEach((ability, abilityIndex) => {
    const abilityActions = mechanicsForAbility(ability)?.actions ?? [];
    abilityActions.forEach((action) => {
      actions.push({
        kind: "ability",
        key: `ability:${abilityIndex}:${action.id}`,
        name: action.name,
        cost: action.cost,
        note: action.costNote,
        // The reused `ActionRow` computes and shows its own enablement
        // (pool empty, no slot to restore), so second-guessing it here would
        // only risk the two disagreeing.
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
