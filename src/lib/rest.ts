import { charPath, updateAt } from "src/lib/cursor";
import {
  DieOperation,
  FIELD,
  LeveledSpellLevel,
  Operation,
  RestType,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { actionFieldPath, UpdateAction } from "src/lib/hooks/reducers/actions";
import { setFieldValue } from "src/lib/fields";
import {
  abilityMaxUses,
  maxHpValue,
  rollPoolRestore,
} from "src/lib/mechanics/resolve";
import {
  matchesTrigger,
  rechargeIntervalDays,
  tickDawn,
} from "src/lib/play/triggers";
import { hitDieHealing, ridersFor } from "src/lib/mechanics/riders";
import { rollFormula } from "src/lib/roll";
import {
  expendedSpellSlots,
  getHitDice,
  getPactSlotInfo,
  isPreparedCaster,
  preparedSpellCount,
  preparedSpellsFor,
  remainingHitDice,
} from "src/lib/rules";
import { UUID } from "crypto";
import {
  Character,
  CustomFormula,
  HitDice,
  IClass,
  LimitedUseAbility,
  RechargeCriteria,
} from "src/lib/types";

// Running a rest. The whole thing is a pure planner: `planRest` reads the
// character plus the table's variant rules and returns the reducer updates a
// rest would make, alongside a human-readable account of them. Nothing is
// dispatched here, which is what lets the UI *preview* a rest ("this will give
// back 4 spell slots and 2 hit dice") before committing, and lets the writes
// sync/undo as one ordinary edit like every other change.
//
// The interactive parts of a rest — spending hit dice, re-preparing spells —
// are deliberately NOT in the plan. They're reported as `followUps` so the rest
// UI can walk the player through them, each applying its own updates.

export type RestKind = "short" | "long";

// The DMG's rest-pacing variants (DMG p.267). These change only how long a rest
// takes in fiction; the mechanical effects are identical, which is why the
// planner uses this for labels alone.
export type RestVariant = "standard" | "epic" | "gritty";

// The subset of settings a rest depends on. `Settings` satisfies this
// structurally, so callers pass `settings` straight through.
export interface RestRules {
  restVariant: RestVariant;
  longRestHitDiceRecovery: "half" | "all" | "none";
  longRestHpRecovery: "full" | "none";
  longRestExhaustionRecovery: "one" | "all" | "none";
  longRestClearsTempHp: boolean;
}

export const DEFAULT_REST_RULES: RestRules = {
  restVariant: "standard",
  longRestHitDiceRecovery: "half",
  longRestHpRecovery: "full",
  longRestExhaustionRecovery: "one",
  longRestClearsTempHp: true,
};

const REST_DURATIONS: Record<RestVariant, Record<RestKind, string>> = {
  standard: { short: "1 hour", long: "8 hours" },
  epic: { short: "5 minutes", long: "1 hour" },
  gritty: { short: "8 hours", long: "7 days" },
};

export function restDuration(kind: RestKind, rules: RestRules): string {
  return REST_DURATIONS[rules.restVariant ?? "standard"][kind];
}

// How many dawns a rest that "spans dawn" spans. One, except gritty realism's
// week-long long rest — which is what lets an "Every 7 days" item come all the
// way back over it.
export function restDawnSpan(kind: RestKind, rules: RestRules): number {
  return rules.restVariant === "gritty" && kind === "long" ? 7 : 1;
}

// One thing a rest does (or notably doesn't) to the sheet. `key` is stable so
// the UI can key a list and attach its own iconography.
export interface RestChange {
  key: string;
  label: string;
  detail: string;
}

// Something the player has to do during the rest that the planner can't decide
// for them.
export type RestFollowUp =
  // HP are missing and hit dice remain to spend (RAW on a short rest; also on a
  // long rest under Slow Natural Healing, where dice are the only healing).
  | { kind: "spendHitDice"; missingHp: number; diceRemaining: number }
  // A prepared caster's daily re-preparation, one per prepared-caster class.
  | {
      kind: "prepareSpells";
      classId: UUID;
      className: string;
      prepared: number;
      allowed: number;
    }
  // Pools with a recharge trigger that isn't a rest ("Dawn", "Initiative", …).
  // The planner leaves these alone rather than guessing; the player decides.
  | { kind: "manualRecharge"; abilities: { title: string; when: string }[] };

export interface RestPlan {
  kind: RestKind;
  duration: string;
  // The writes, ready to dispatch. Every one is a whole-value `update_*`, so
  // the rest replays over a live session and reverses in one undo step.
  updates: UpdateAction[];
  // What the rest restores, and (for a short rest) what it notably doesn't.
  changes: RestChange[];
  unchanged: RestChange[];
  followUps: RestFollowUp[];
  // Hit dice this plan hands back, and the total number it's allowed to — the
  // player picks the split when multiclassing, so the UI shows both.
  hitDiceRecovered: HitDice;
  hitDiceBudget: number;
}

// ---------------------------------------------------------------------------
// Recharge matching

// Whether a pool's `recharge` trigger fires on this rest. Matching is textual
// because `RechargeCriteria` is deliberately open (`RestType | string`): the
// presets are "Short Rest"/"Long Rest", but homebrew writes what it likes, and
// feature text says "a short or long rest". A short-rest pool always refreshes
// on a long rest too — that's how 5e words every one of them.
export function rechargesOnRest(
  recharge: RechargeCriteria,
  kind: RestKind,
): boolean {
  const trigger = (recharge ?? "").toLowerCase();
  if (trigger.includes("short")) return true;
  if (trigger.includes("long")) return kind === "long";
  return false;
}

// The recharge trigger as it reads mid-sentence, e.g. the sheet's "per long
// rest". The presets are stored Title Case ("Long Rest") because they're enum
// values, but the PHB writes "long rest" in prose and the caption is a sentence
// fragment. Only the two presets are lowered — homebrew triggers are left alone,
// since "Dawn" may well be a proper noun at someone's table.
export function formatRecharge(recharge: RechargeCriteria): string {
  const trigger = recharge ?? "";
  // "Every 7 days" reads as "per 7 days" mid-sentence, not "per every 7 days".
  const interval = rechargeIntervalDays(trigger);
  if (interval !== undefined)
    return interval === 1 ? "day" : `${interval} days`;
  return trigger === RestType.shortRest || trigger === RestType.longRest
    ? trigger.toLowerCase()
    : trigger;
}

// Whether a trigger is a rest at all. Anything else ("Dawn") is surfaced to the
// player instead of being silently skipped.
function isRestTrigger(recharge: RechargeCriteria): boolean {
  const trigger = (recharge ?? "").toLowerCase();
  return trigger.includes("short") || trigger.includes("long");
}

// ---------------------------------------------------------------------------
// Hit dice

export function totalHitDiceCount(character: Character): number {
  const dice = character.totalHitDice ?? getHitDice(character);
  return Object.values(dice).reduce((sum, n) => sum + (n || 0), 0);
}

export function expendedHitDiceCount(character: Character): number {
  return Object.values(character.expendedHitDice ?? {}).reduce(
    (sum, n) => sum + (n || 0),
    0,
  );
}

// How many spent hit dice a long rest gives back. RAW is half your total,
// rounded down, minimum one die — but never more than you actually spent.
export function hitDiceBudget(character: Character, rules: RestRules): number {
  const spent = expendedHitDiceCount(character);
  if (spent <= 0) return 0;
  switch (rules.longRestHitDiceRecovery) {
    case "none":
      return 0;
    case "all":
      return spent;
    case "half":
    default:
      return Math.min(
        spent,
        Math.max(1, Math.floor(totalHitDiceCount(character) / 2)),
      );
  }
}

// Biggest first: the order a player recovering a partial budget of hit dice
// wants, and the order the rest UI offers dice to spend in.
const DIE_ORDER: StandardDie[] = [
  StandardDie.d12,
  StandardDie.d10,
  StandardDie.d8,
  StandardDie.d6,
  StandardDie.d4,
  StandardDie.d20,
];

// Spread a recovery budget over the dice actually spent, biggest first — the
// choice a multiclass character almost always wants, and the default the UI
// offers before letting them re-split it.
export function allocateHitDiceRecovery(
  character: Character,
  budget: number,
): HitDice {
  const out: HitDice = {};
  let left = budget;
  for (const die of DIE_ORDER) {
    if (left <= 0) break;
    const spent = character.expendedHitDice?.[die] || 0;
    if (spent <= 0) continue;
    const give = Math.min(spent, left);
    out[die] = give;
    left -= give;
  }
  return out;
}

// The formula for one hit die's healing: 1d<die> + CON.
export function hitDieFormula(die: StandardDie): CustomFormula {
  return {
    operation: Operation.addition,
    operands: [[1, die, DieOperation.roll], StatKey.con],
  };
}

export interface HitDieRoll {
  die: StandardDie;
  // The raw 1d<die> + CON total, and the individual dice behind it.
  total: number;
  dice: number[];
  // HP actually regained: the total after minimum-total riders (Durable),
  // clamped to what's missing.
  healed: number;
}

// Roll one hit die. Pure read — no writes; pair with `applyHitDieRoll`. Split in
// two so a caller can show the roll and confirm before applying (the roll
// dialog) or apply immediately (the rest flow).
export function rollHitDie(character: Character, die: StandardDie): HitDieRoll {
  const dice: number[] = [];
  // Same rider set the roll dialog uses, so a reroll-on-1 feature behaves the
  // same whether the die is spent from a rest or from the die's own roll button.
  const total = rollFormula(
    hitDieFormula(die),
    character,
    dice,
    ridersFor(character, "hitDie"),
  );
  const healing = hitDieHealing(character, total);
  const healed = Math.min(
    healing,
    Math.max(0, maxHpValue(character) - character.currHp),
  );
  return { die, total, dice, healed };
}

// The writes for a rolled hit die: raise current HP and mark the die spent.
export function applyHitDieRoll(
  character: Character,
  roll: HitDieRoll,
): UpdateAction[] {
  return [
    updateAt(charPath(FIELD.currHp), character.currHp + roll.healed),
    updateAt(
      charPath(FIELD.expendedHitDice).k(roll.die),
      (character.expendedHitDice?.[roll.die] || 0) + 1,
    ),
  ];
}

// Hit dice sizes the character can still spend, biggest first.
export function spendableHitDice(character: Character): StandardDie[] {
  return DIE_ORDER.filter((die) => remainingHitDice(character, die) > 0);
}

// ---------------------------------------------------------------------------
// Planning

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function formatHitDice(dice: HitDice): string {
  return Object.entries(dice)
    .filter(([, n]) => (n || 0) > 0)
    .map(([die, n]) => `${n}${die}`)
    .join(", ");
}

// Prepared-caster classes that should re-pick their spells on a long rest.
export function preparedCasterClasses(character: Character): IClass[] {
  return character.class.filter(
    (klass) =>
      isPreparedCaster(klass.name) &&
      preparedSpellCount(character, klass) !== null,
  );
}

function poolChanges(
  character: Character,
  kind: RestKind,
  // Dawns this rest spans; 0 when it doesn't span dawn at all.
  dawns: number,
): {
  updates: UpdateAction[];
  restored: RestChange[];
  withheld: RestChange[];
  manual: { title: string; when: string }[];
} {
  const updates: UpdateAction[] = [];
  const restored: RestChange[] = [];
  const withheld: RestChange[] = [];
  const manual: { title: string; when: string }[] = [];

  (character.limitedUseAbilities ?? []).forEach(
    (ability: LimitedUseAbility, index: number) => {
      if (ability.expended <= 0) return;
      const max = abilityMaxUses(ability, character);
      const entry = {
        key: `pool:${index}`,
        label: ability.info.title,
      };
      // A rest the table says spans dawn also fires the "at dawn" recharges —
      // magic items, mostly — that would otherwise land in the manual list.
      // That includes "Every X days" countdowns, which tick once per dawn the
      // rest spans and restore when they come due.
      const dawnish =
        matchesTrigger(ability.recharge, "dawn") ||
        rechargeIntervalDays(ability.recharge) !== undefined;
      const atDawn = dawns > 0 && dawnish;
      if (!isRestTrigger(ability.recharge) && !atDawn) {
        manual.push({ title: ability.info.title, when: ability.recharge });
        return;
      }
      if (atDawn) {
        const tick = tickDawn(character, ability, index, dawns);
        if (!tick) return;
        updates.push(...tick.updates);
        if (tick.daysLeft !== undefined) {
          // Only the countdown moved: the pool stays spent, but the tick still
          // has to land, so the counter update above goes out regardless.
          withheld.push({
            ...entry,
            detail: `${plural(ability.expended, "use")} spent — ${plural(
              tick.daysLeft,
              "day",
            )} until recharge`,
          });
          return;
        }
        if (tick.restored <= 0) return;
        const count = `${plural(tick.restored, "use")} back`;
        restored.push({
          ...entry,
          detail: !tick.rolled
            ? `${count} (${max} total) — at dawn`
            : tick.newExpended > 0
              ? `${count} (rolled at dawn; ${tick.newExpended} still spent)`
              : `${count} (rolled at dawn)`,
        });
      } else if (rechargesOnRest(ability.recharge, kind)) {
        const back = rollPoolRestore(ability, character);
        if (back.restored <= 0) return;
        updates.push(
          updateAt(
            charPath(FIELD.limitedUseAbilities).at(index).k("expended"),
            back.newExpended,
          ),
        );
        const count = `${plural(back.restored, "use")} back`;
        restored.push({
          ...entry,
          detail: !back.rolled
            ? `${count} (${max} total)`
            : back.newExpended > 0
              ? `${count} (rolled; ${back.newExpended} still spent)`
              : `${count} (rolled)`,
        });
      } else {
        withheld.push({
          ...entry,
          detail: `${plural(ability.expended, "use")} spent — needs a long rest`,
        });
      }
    },
  );

  return { updates, restored, withheld, manual };
}

export interface PlanRestOptions {
  // Override the biggest-first default for which hit dice a long rest gives
  // back. Values are clamped to what's spent and to the recovery budget.
  hitDiceRecovery?: HitDice;
  // The table says this rest spans dawn, so pools that recharge "at dawn"
  // (matched by `matchesTrigger`) come back with the rest instead of being
  // deferred to the manual-recharge follow-up.
  spansDawn?: boolean;
}

export function planRest(
  character: Character,
  kind: RestKind,
  rules: RestRules = DEFAULT_REST_RULES,
  options: PlanRestOptions = {},
): RestPlan {
  const updates: UpdateAction[] = [];
  const changes: RestChange[] = [];
  const unchanged: RestChange[] = [];
  const followUps: RestFollowUp[] = [];

  const maxHp = maxHpValue(character);

  // --- Hit points (long rest only) ---
  let finalHp = character.currHp;
  if (kind === "long" && rules.longRestHpRecovery === "full") {
    if (character.currHp < maxHp) {
      updates.push(updateAt(charPath(FIELD.currHp), maxHp));
      changes.push({
        key: "hp",
        label: "Hit points",
        detail: `Full — ${character.currHp} → ${maxHp}`,
      });
      finalHp = maxHp;
    }
  } else if (character.currHp < maxHp) {
    unchanged.push({
      key: "hp",
      label: "Hit points",
      detail:
        kind === "long"
          ? `${character.currHp}/${maxHp} — slow natural healing: spend hit dice`
          : `${character.currHp}/${maxHp} — spend hit dice to heal`,
    });
  }

  // --- Temporary HP (expire on a long rest, RAW) ---
  if (kind === "long" && rules.longRestClearsTempHp && character.tempHp > 0) {
    updates.push(updateAt(charPath(FIELD.tempHp), 0));
    changes.push({
      key: "tempHp",
      label: "Temporary HP",
      detail: `${character.tempHp} expire`,
    });
  }

  // --- Hit dice (long rest only) ---
  const budget = kind === "long" ? hitDiceBudget(character, rules) : 0;
  const recovered = clampHitDiceRecovery(
    character,
    options.hitDiceRecovery ?? allocateHitDiceRecovery(character, budget),
    budget,
  );
  for (const [die, n] of Object.entries(recovered)) {
    if (!n) continue;
    const key = die as StandardDie;
    updates.push(
      updateAt(
        charPath(FIELD.expendedHitDice).k(key),
        Math.max(0, (character.expendedHitDice?.[key] || 0) - n),
      ),
    );
  }
  const recoveredCount = Object.values(recovered).reduce(
    (sum, n) => sum + (n || 0),
    0,
  );
  if (recoveredCount > 0) {
    changes.push({
      key: "hitDice",
      label: "Hit dice",
      detail: `${formatHitDice(recovered)} back (${recoveredCount} of ${plural(
        expendedHitDiceCount(character),
        "spent die",
        "spent dice",
      )})`,
    });
  } else if (kind === "long" && expendedHitDiceCount(character) > 0) {
    unchanged.push({
      key: "hitDice",
      label: "Hit dice",
      detail: `${plural(expendedHitDiceCount(character), "die", "dice")} stay spent`,
    });
  }

  // --- Spell slots (long rest only) ---
  const slotsBack: string[] = [];
  let slotCount = 0;
  for (let level = 1; level <= 9; level++) {
    const slotLevel = level as LeveledSpellLevel;
    const expended = expendedSpellSlots(character, slotLevel);
    if (expended <= 0) continue;
    if (kind === "long") {
      updates.push(
        updateAt(charPath(FIELD.spellSlots).k(slotLevel).k("expended"), 0),
      );
    }
    slotsBack.push(`${expended}×L${level}`);
    slotCount += expended;
  }
  if (slotCount > 0) {
    const entry = {
      key: "spellSlots",
      label: "Spell slots",
      detail: `${plural(slotCount, "slot")} (${slotsBack.join(", ")})`,
    };
    if (kind === "long") changes.push(entry);
    else
      unchanged.push({
        ...entry,
        detail: `${entry.detail} — need a long rest`,
      });
  }

  // --- Pact magic slots (a short rest is enough) ---
  const pactTotal =
    character.pactSlots?.totalOverride ?? getPactSlotInfo(character).total;
  const pactExpended = Math.min(character.pactSlots?.expended ?? 0, pactTotal);
  if (pactExpended > 0) {
    updates.push(updateAt(charPath(FIELD.pactSlots).k("expended"), 0));
    changes.push({
      key: "pactSlots",
      label: "Pact magic",
      detail: `${plural(pactExpended, "slot")} back (${pactTotal} total)`,
    });
  }

  // --- Limited-use pools ---
  const pools = poolChanges(
    character,
    kind,
    options.spansDawn ? restDawnSpan(kind, rules) : 0,
  );
  updates.push(...pools.updates);
  changes.push(...pools.restored);
  unchanged.push(...pools.withheld);
  if (pools.manual.length > 0)
    followUps.push({ kind: "manualRecharge", abilities: pools.manual });

  // --- Exhaustion (long rest only) ---
  if (kind === "long" && character.exhaustion > 0) {
    const shed =
      rules.longRestExhaustionRecovery === "all"
        ? character.exhaustion
        : rules.longRestExhaustionRecovery === "one"
          ? 1
          : 0;
    if (shed > 0) {
      updates.push(
        updateAt(charPath(FIELD.exhaustion), character.exhaustion - shed),
      );
      changes.push({
        key: "exhaustion",
        label: "Exhaustion",
        detail: `${character.exhaustion} → ${character.exhaustion - shed}`,
      });
    } else {
      unchanged.push({
        key: "exhaustion",
        label: "Exhaustion",
        detail: `Stays at ${character.exhaustion}`,
      });
    }
  }

  // --- Death saves: moot once you're conscious again ---
  const { successes, failures } = character.deathSaves;
  if (kind === "long" && finalHp > 0 && (successes > 0 || failures > 0)) {
    updates.push(
      updateAt(charPath(FIELD.deathSaves), { successes: 0, failures: 0 }),
    );
    changes.push({
      key: "deathSaves",
      label: "Death saves",
      detail: "Cleared",
    });
  }

  // --- Follow-ups the player drives ---
  const missingHp = Math.max(0, maxHp - finalHp);
  const diceRemaining =
    totalHitDiceCount(character) -
    Math.max(0, expendedHitDiceCount(character) - recoveredCount);
  if (missingHp > 0 && diceRemaining > 0)
    followUps.push({ kind: "spendHitDice", missingHp, diceRemaining });

  if (kind === "long") {
    for (const klass of preparedCasterClasses(character)) {
      followUps.push({
        kind: "prepareSpells",
        classId: klass.id,
        className: klass.name,
        prepared: preparedSpellsFor(character, klass.id),
        allowed: preparedSpellCount(character, klass) ?? 0,
      });
    }
  }

  return {
    kind,
    duration: restDuration(kind, rules),
    updates,
    changes,
    unchanged,
    followUps,
    hitDiceRecovered: recovered,
    hitDiceBudget: budget,
  };
}

// Fold a plan's updates into a new character. The rest is dispatched as one
// `replace_character` rather than N `update_*` actions so it costs a single
// undo — a mis-clicked long rest touches a dozen fields, and unwinding it one
// field at a time isn't undo, it's archaeology. Same reasoning as the level-up
// wizard's single-action finish.
export function applyRestPlan(character: Character, plan: RestPlan): Character {
  const next = structuredClone(character);
  for (const update of plan.updates)
    setFieldValue(actionFieldPath(update), next, update.payload.value);
  return next;
}

// Keep a caller-supplied allocation honest: never more than was spent of a
// size, never more than the budget in total. Iterated in the caller's own key
// order, so an over-budget allocation is truncated from the end of what they
// asked for rather than silently re-prioritized.
function clampHitDiceRecovery(
  character: Character,
  wanted: HitDice,
  budget: number,
): HitDice {
  const out: HitDice = {};
  let left = budget;
  for (const die of Object.keys(wanted) as StandardDie[]) {
    if (left <= 0) break;
    const want = wanted[die] || 0;
    if (want <= 0) continue;
    const give = Math.min(want, character.expendedHitDice?.[die] || 0, left);
    if (give > 0) {
      out[die] = give;
      left -= give;
    }
  }
  return out;
}
