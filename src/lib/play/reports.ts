import { DamageType, StatKey } from "src/lib/data/data-definitions";
import { CheckMode } from "src/lib/roll";

// What a player rolled, on its way to whoever runs the table.
//
// This replaces the old pair of one-shot messages (a damage report and a roll
// call's answer) with **one stream of rolls**, because an attack is not one
// roll — it's a small conversation. The old flow made the player hold that
// conversation out loud: roll to hit, ask the DM whether it landed, roll
// damage, *then* pick a target and press a button to send a bare number. Four
// steps, three of them invisible to the person who has to rule on them.
//
// Two properties do all the work here:
//
// 1. **Rolls belong to an exchange.** The to-hit and the damage of one swing
//    share an `exchangeId`, so the DM reads a single filling-in card ("Brakka
//    → Goblin 2, Greatsword: 15 to hit, 9 slashing") instead of two unrelated
//    numbers arriving a minute apart.
// 2. **Every roll is sent the moment it lands, and re-rolls are numbered.**
//    Nothing blocks — a player who forgot they had advantage just rolls again,
//    and the DM sees `attempt 2` next to it. That is the whole enforcement
//    model, and it is deliberately social rather than technical: a rogue
//    client can publish whatever it likes, so the goal is only to make the
//    ordinary, tempting, half-innocent re-roll *visible* at the table. What
//    can't be stopped can still be witnessed.
//
// The same shape carries a check, so "give me a Perception check" and its
// answer ride the queue the attack does.

export type RollStage =
  // "I cast Hideous Laughter on Goblin 1." The announcement of a save-based
  // cast that rolls nothing itself — the *target* rolls, so without this
  // stage a spell with no damage dice had no way onto the wire at all.
  // Carries the save DC; `total` is meaningless and rendered as none.
  | "cast"
  // The d20 against a target's AC. Rulable: the DM answers hit or miss.
  | "toHit"
  // Damage rolled at a target. Applyable — the DM's write, as before.
  | "damage"
  // Healing rolled for a target. Approved, then offered to the recipient —
  // or, untargeted, a self-heal announced for visibility (a hit die, Second
  // Wind): the HP change reaches the DM through the vitals projection, this
  // is the "why" that used to be invisible beside it. No target → nothing to
  // apply, the card just says what happened.
  | "healing"
  // Any other d20 the table asked for: a save, a skill, a concentration check.
  | "check"
  // A die rolled for its own sake in front of the table — a feature's display
  // roll (Temporary HP, a superiority die). Nothing to rule and nothing to
  // apply; visibility is the whole point, same bargain as `manual`.
  | "roll";

// One damage type's contribution, itemised. On the wire because resistance and
// immunity are the DM's ruling and they can't make it from a lump sum — and
// because an itemised extra ("Sneak Attack 3d6") is how a once-per-turn rider
// gets noticed the second time it shows up in a round.
export interface ReportedDamage {
  total: number;
  damageType?: DamageType;
  // Set for a rider riding along on the hit (Sneak Attack, Divine Smite).
  source?: string;
}

// One named add-on rolled alongside a d20 — a rider's bonus die, with the
// faces behind it so "+5 — Bless (d4: 4, 1)" reads as the dice it was.
export interface ReportedBonus {
  source: string;
  total: number;
  dice?: number[];
}

export interface RollReport {
  reportId: string;
  // Shared by every roll of one act. See the note above.
  exchangeId: string;
  stage: RollStage;
  // 1-based. Anything above 1 is a re-roll of the same stage, and the queue
  // says so rather than quietly replacing the number.
  attempt: number;
  // Who rolled it. The client id is here so a ruling can be addressed back to
  // them; the name is what the DM reads.
  fromClientId: string;
  fromName: string;
  // "Greatsword", "Fire Bolt (3rd)", "Perception".
  label: string;
  total: number;
  targetId?: string;
  targetName?: string;
  // A save-the-room effect (Fireball on Orc 1 and 2) names every creature it
  // was aimed at. Used *instead of* `targetId`, never alongside it — an
  // attack roll has one target, a save-based effect any number. `targetNames`
  // is index-aligned, filled in by the sender like `targetName` is.
  targetIds?: string[];
  targetNames?: string[];
  // The player typed this total from real dice rather than the app rolling it.
  // Not an accusation — half the tables in the world roll physical dice — but
  // the DM should be able to tell an asserted number from a generated one.
  manual?: boolean;

  // --- d20 detail (toHit, check) ---
  // Every face rolled, so advantage is visible as the two dice it was.
  faces?: number[];
  kept?: number;
  mode?: CheckMode;
  critical?: boolean;
  fumble?: boolean;
  // Bonus dice riding the d20 (Bless's d4), itemised by source — the add-on
  // the seat can't reconstruct from the total. Flat modifiers deliberately
  // aren't carried: whatever separates the total from the kept face and these
  // bonuses *is* the modifier (see `impliedModifier`), so the parts always
  // add up to the total shown.
  bonuses?: ReportedBonus[];

  // --- damage / healing detail ---
  parts?: ReportedDamage[];
  crit?: boolean;
  // A save-based effect's DC, so the DM can rule without being told it out
  // loud — the one number the old damage report left entirely to the voice.
  save?: { dc: number; stat?: StatKey; onSuccess?: "half" | "none" };
  // The condition this cast puts on its targets ("Bless", "Hideous
  // Laughter"). A *name*, never mechanics — every client resolves it against
  // the bundled `CONDITION_MECHANICS` catalog, so nothing executable crosses
  // the wire. The DM board offers per-target apply buttons off it; character-
  // backed targets get a consent prompt instead (`ConditionOffer`).
  condition?: { name: string; rounds?: number };
  // The sender's own participant row, stamped by the table-talk layer — a
  // mark's provenance. Whoever applies the condition writes it into
  // `ActiveCondition.from`, which is what pays a caster-only mark (Hex's d6)
  // to its caster and nobody else.
  fromParticipantId?: string;
}

// What a roll surface hands the encounter to publish. Identity and the
// target's name are the provider's to fill in — the dialog knows what it
// rolled, not who it is on the wire.
export type OutgoingRoll = Omit<
  RollReport,
  "reportId" | "fromClientId" | "fromName" | "targetName"
>;

// The DM's answer to a to-hit roll: the sentence that used to be spoken across
// the table. Addressed to the roller, but broadcast like everything else here
// (the broker has no private lanes) and keyed by exchange so the player's
// dialog can show it under the very roll it answers.
export interface RollVerdict {
  exchangeId: string;
  toClientId: string;
  // hit / miss / critical answer a to-hit; success / failure answer a check —
  // the same spoken sentence, two words wider, so "you make it" no longer has
  // to cross the table by voice while "that hits" doesn't.
  outcome: "hit" | "miss" | "critical" | "success" | "failure";
}

// How many reports the queue keeps. A table rolls a lot in an evening and
// nobody scrolls back past the current fight; the cap is what stops a queue
// nobody dismissed from growing all night.
export const REPORT_CAP = 60;

// Add a report to the queue: idempotent by id (a re-send is a repeat, not a
// second swing), oldest dropped past the cap.
export function withReport(
  reports: RollReport[],
  report: RollReport,
  cap = REPORT_CAP,
): RollReport[] {
  if (reports.some((r) => r.reportId === report.reportId)) return reports;
  return [...reports, report].slice(-cap);
}

export function withoutExchange(
  reports: RollReport[],
  exchangeId: string,
): RollReport[] {
  if (!reports.some((r) => r.exchangeId === exchangeId)) return reports;
  return reports.filter((r) => r.exchangeId !== exchangeId);
}

// One stage of an exchange, with its history: the roll that stands and the
// ones it replaced. Superseded rolls are kept rather than dropped — they are
// the point.
export interface ExchangeStage {
  stage: RollStage;
  latest: RollReport;
  superseded: RollReport[];
}

// One creature an exchange is aimed at, as the card shows it. Normalised from
// the wire's two shapes (`targetId` / `targetIds`) so the board renders one
// list either way.
export interface ExchangeTarget {
  id: string;
  name?: string;
}

export interface Exchange {
  exchangeId: string;
  fromClientId: string;
  fromName: string;
  label: string;
  targets: ExchangeTarget[];
  stages: ExchangeStage[];
}

const STAGE_ORDER: RollStage[] = [
  "cast",
  "check",
  "roll",
  "toHit",
  "damage",
  "healing",
];

function targetsOf(report: RollReport): ExchangeTarget[] {
  if (report.targetIds?.length)
    return report.targetIds.map((id, i) => ({
      id,
      name: report.targetNames?.[i],
    }));
  if (report.targetId)
    return [{ id: report.targetId, name: report.targetName }];
  return [];
}

// Group a flat queue into the cards the board renders: one per exchange, in
// the order they were first heard, each stage carrying its re-roll trail.
export function exchanges(reports: RollReport[]): Exchange[] {
  const byId = new Map<string, Exchange>();
  const byStage = new Map<string, RollReport[]>();
  for (const report of reports) {
    const existing = byId.get(report.exchangeId);
    if (!existing) {
      byId.set(report.exchangeId, {
        exchangeId: report.exchangeId,
        fromClientId: report.fromClientId,
        fromName: report.fromName,
        label: report.label,
        targets: targetsOf(report),
        stages: [],
      });
    } else {
      // A later stage is allowed to name the target the first one didn't: a
      // player who rolls to hit untargeted and picks before rolling damage
      // should still produce one card that knows who it was aimed at.
      if (!existing.targets.length) {
        existing.targets = targetsOf(report);
      }
    }
    const key = `${report.exchangeId} ${report.stage}`;
    byStage.set(key, [...(byStage.get(key) ?? []), report]);
  }
  for (const exchange of byId.values()) {
    const stages: ExchangeStage[] = [];
    for (const stage of STAGE_ORDER) {
      const rolls = byStage.get(`${exchange.exchangeId} ${stage}`);
      if (!rolls?.length) continue;
      // The highest attempt stands, whatever order the messages arrived in.
      const ordered = [...rolls].sort((a, b) => a.attempt - b.attempt);
      stages.push({
        stage,
        latest: ordered[ordered.length - 1],
        superseded: ordered.slice(0, -1),
      });
    }
    exchange.stages = stages;
  }
  return [...byId.values()];
}

// Whether a to-hit total clears a target's AC. Advisory to the bone — the DM
// rules, and half the reasons an attack misses (a Shield reaction, cover the
// app can't see, the wrong target entirely) never reach this function. An AC
// of 0 is the app's "not tracked", so it yields no opinion at all.
export function beatsAc(
  total: number,
  ac: number | undefined,
): "hits" | "misses" | undefined {
  if (!ac || ac <= 0) return undefined;
  return total >= ac ? "hits" : "misses";
}

// "Brakka rolled 18 (adv 12, 18)". The d20 detail as one string, or nothing
// when there's no detail worth printing.
export function formatFaces(report: RollReport): string | undefined {
  if (!report.faces?.length) return undefined;
  const prefix =
    report.mode === "advantage"
      ? "adv "
      : report.mode === "disadvantage"
        ? "disadv "
        : "";
  if (report.faces.length === 1) return `d20 ${report.faces[0]}`;
  return `d20 ${prefix}${report.faces.join(", ")} → ${report.kept}`;
}

// The flat modifier a d20 report implies: whatever separates the total from
// the kept face and the itemised bonus dice. Derived rather than carried, so
// the parts always add up to the total shown. Undefined when there's no d20
// detail or nothing was added.
export function impliedModifier(report: RollReport): number | undefined {
  if (report.kept === undefined) return undefined;
  const bonuses = (report.bonuses ?? []).reduce((sum, b) => sum + b.total, 0);
  const mod = report.total - report.kept - bonuses;
  return mod === 0 ? undefined : mod;
}
