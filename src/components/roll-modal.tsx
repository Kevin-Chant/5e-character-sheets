import { useMemo, useState } from "react";
import {
  formatCustomFormula,
  formatCustomFormulaWithDamage,
} from "src/lib/formula";
import { useCharacter } from "src/lib/hooks/use-character";
import { useRoller } from "src/lib/hooks/use-roller";
import { useSettings } from "src/lib/hooks/use-settings";
import { CheckMode, rollD20Check, rollDamage, rollFormula } from "src/lib/roll";
import {
  spellDamageAtLevel,
  spellHealingAtLevel,
} from "src/lib/spells/spell-scaling";
import { availableSpellSlots, remainingHitDice } from "src/lib/rules";
import {
  advantageNotes,
  critThreshold,
  extraDamageRiders,
  hitDieHealing,
  ridersFor,
} from "src/lib/mechanics/riders";
import { maxHpValue, resolveEffects } from "src/lib/mechanics/resolve";
import {
  DamageType,
  DieOperation,
  LeveledSpellLevel,
  Operation,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import {
  Character,
  CustomFormula,
  CustomFormulaWithDamage,
  DieDefinition,
  RollRider,
  Spell,
} from "src/lib/types";

// The one rider the roll dialog interprets directly (rather than folding via
// `applyTotalRiders`): extra weapon-attack damage the player may opt into.
type ExtraDamageRider = Extract<RollRider, { rider: "extraDamage" }>;
type SlotScaling = NonNullable<ExtraDamageRider["slot"]>;

const dieLabel = (die: DieDefinition) =>
  typeof die === "string" ? die : `d${die.numFaces}`;

// Divine Smite dice at a chosen slot level: `diceAtMin` at `minLevel`, +1 per
// level above, capped at `maxDice`.
const smiteDiceCount = (slot: SlotScaling, level: number) =>
  Math.min(slot.diceAtMin + (level - slot.minLevel), slot.maxDice);

const totalLevel = (levels: { level: number }[]) =>
  levels.reduce((sum, c) => sum + (c.level || 0), 0);

const ordinalSlot = (n: number) =>
  `${n}${["th", "st", "nd", "rd"][n % 10 > 3 || (n >= 11 && n <= 13) ? 0 : n % 10]}`;

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// The roll dialog. Read-only: it reuses the modal CSS but not ModalContainer (no
// draft reducer / targeted-field coupling). An "attack" surfaces a to-hit roll
// and its damage together, so one button handles both steps of an attack.
export default function RollModal() {
  const { character } = useCharacter();
  const { request, closeRoller } = useRoller();
  if (!request || !character) return <></>;

  const { spec } = request;
  return (
    <Shell label={request.label} close={closeRoller}>
      {spec.kind === "check" && (
        <CheckControls character={character} modifier={spec.modifier} />
      )}
      {spec.kind === "formula" && (
        <FormulaControls character={character} formula={spec.formula} />
      )}
      {spec.kind === "hitDie" && (
        <HitDieControls character={character} die={spec.die} />
      )}
      {spec.kind === "attack" && (
        <>
          {spec.toHit !== undefined && (
            <CheckControls
              character={character}
              label="To Hit"
              modifier={spec.toHit}
              isAttack
            />
          )}
          <EffectControls
            character={character}
            damage={spec.damage}
            spell={spec.spell}
            titled={spec.toHit !== undefined}
          />
        </>
      )}
    </Shell>
  );
}

// The crit callout for the kept d20, or undefined when none applies. Attack
// to-hit rolls always show it (a die at/above the crit threshold — usually a
// nat 20, wider with Improved Critical — is a "Critical Hit", nat 1 a
// "Critical Miss"); other checks only when the global setting is on, with a
// nat 20 = "Critical Success" and a nat 1 = "Critical Fail".
function critLabelFor(
  kept: number,
  isAttack: boolean,
  onAllRolls: boolean,
  threshold: number,
): string | undefined {
  if (!isAttack && !onAllRolls) return undefined;
  if (kept >= (isAttack ? threshold : 20))
    return isAttack ? "Critical Hit" : "Critical Success";
  if (kept === 1) return isAttack ? "Critical Miss" : "Critical Fail";
  return undefined;
}

// A d20 + modifier roll with advantage/disadvantage. Reused as a standalone
// check and as the "To Hit" half of an attack. Riders for the roll kind
// (rerolls, minimum dice, crit range) come from the character's features.
function CheckControls({
  character,
  modifier,
  label,
  isAttack = false,
}: {
  character: Character;
  modifier: number;
  label?: string;
  isAttack?: boolean;
}) {
  const {
    settings: { criticalsOnAllRolls },
  } = useSettings();
  const riders = useMemo(
    () => ridersFor(character, isAttack ? "attack" : "check"),
    [character, isAttack],
  );
  const [result, setResult] = useState<ReturnType<typeof rollD20Check> | null>(
    null,
  );
  const roll = (mode: CheckMode) =>
    setResult(rollD20Check(modifier, mode, riders));
  return (
    <div className="column roll-section">
      {label && <p className="roll-section-title">{label}</p>}
      <p className="roll-formula">d20 {signed(modifier)}</p>
      <div className="row roll-modes">
        <button
          aria-label="Roll with disadvantage"
          onClick={() => roll("disadvantage")}
        >
          Disadv.
        </button>
        <button
          aria-label="Roll"
          className="btn-primary roll-go"
          onClick={() => roll("normal")}
        >
          Roll
        </button>
        <button
          aria-label="Roll with advantage"
          onClick={() => roll("advantage")}
        >
          Adv.
        </button>
      </div>
      {advantageNotes(riders).map((note) => (
        <p key={note} className="muted font-small">
          {note}
        </p>
      ))}
      {result &&
        (() => {
          const crit = critLabelFor(
            result.kept,
            isAttack,
            criticalsOnAllRolls,
            critThreshold(riders),
          );
          const critClass =
            result.kept >= critThreshold(riders) && result.kept > 1
              ? "roll-crit-success"
              : "roll-crit-fail";
          return (
            <div className="column roll-result">
              {crit ? (
                <span className={`roll-total font-large ${critClass}`}>
                  {crit}
                </span>
              ) : (
                <span className="roll-total font-large">{result.total}</span>
              )}
              <span className="roll-part muted">
                d20{" "}
                {result.dice.length > 1
                  ? `(${result.dice.join(", ")} → ${result.kept})`
                  : `(${result.kept})`}{" "}
                {signed(result.modifier)}
              </span>
            </div>
          );
        })()}
    </div>
  );
}

// Roll a spell/weapon effect — level-scaled spell damage, spell healing, or a
// fixed damage map. Reused as the "Damage"/"Healing" half of an attack.
function EffectControls({
  character,
  damage,
  spell,
  titled,
}: {
  character: Character;
  damage?: CustomFormulaWithDamage;
  spell?: Spell;
  titled?: boolean;
}) {
  const mechanics = spell?.mechanics;
  const isHealing = !!mechanics?.healing;
  const isCantrip = mechanics?.level === 0;
  const charLevel = totalLevel(character.class);
  const [slotLevel, setSlotLevel] = useState<number | undefined>(undefined);

  // Extra-damage riders apply only to a weapon attack (a fixed `damage` map, no
  // spell) — never to spell damage or healing. `before-attack` riders would be
  // declared alongside the to-hit roll, so they're excluded here (none exist
  // yet). The rest are declared on the hit, i.e. with the damage roll.
  const isWeaponAttack = !spell && !!damage;
  const extras = useMemo<{ source: string; rider: ExtraDamageRider }[]>(() => {
    if (!isWeaponAttack) return [];
    return extraDamageRiders(character).flatMap((r) =>
      r.rider.rider === "extraDamage" && r.rider.declareAt !== "before-attack"
        ? [{ source: r.source, rider: r.rider }]
        : [],
    );
  }, [isWeaponAttack, character]);
  // Opt-in extras (Sneak Attack, Divine Smite) start unchecked; always-on ones
  // (Rage damage) apply unconditionally. Keyed by source.
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const { dispatch } = useCharacter();

  // A slot-powered extra (Divine Smite): the player picks a slot level (which
  // scales the dice) and may toggle a situational bonus, then expends the slot
  // with an explicit button — kept off the re-rollable damage roll, like a hit
  // die spend. At most one is expected, so its state is scalar.
  const slotExtra = extras.find(({ rider }) => rider.slot);
  const [smiteLevel, setSmiteLevel] = useState<number | undefined>(undefined);
  const [smiteBonus, setSmiteBonus] = useState(false);
  const [smiteSpent, setSmiteSpent] = useState(false);
  const smiteLevels = useMemo(() => {
    const slot = slotExtra?.rider.slot;
    if (!slot) return [];
    const out: number[] = [];
    for (let lvl = slot.minLevel; lvl <= 9; lvl++)
      if (availableSpellSlots(character, lvl as LeveledSpellLevel) > 0)
        out.push(lvl);
    return out;
  }, [slotExtra, character]);
  const effSmiteLevel =
    smiteLevel !== undefined && smiteLevels.includes(smiteLevel)
      ? smiteLevel
      : smiteLevels[0];
  const smiteActive =
    !!slotExtra && chosen.has(slotExtra.source) && effSmiteLevel !== undefined;

  // Only offer slot levels the character actually has unspent (and at/above the
  // spell's base level). Cantrips use no slots, so this is empty for them.
  const availableLevels = useMemo(() => {
    if (!mechanics || isCantrip) return [];
    const out: number[] = [];
    for (let lvl = mechanics.level; lvl <= 9; lvl++)
      if (availableSpellSlots(character, lvl as LeveledSpellLevel) > 0)
        out.push(lvl);
    return out;
  }, [mechanics, isCantrip, character]);
  const noSlots = !!spell && !isCantrip && availableLevels.length === 0;
  const castLevel = isCantrip
    ? charLevel
    : slotLevel !== undefined && availableLevels.includes(slotLevel)
      ? slotLevel
      : (availableLevels[0] ?? mechanics?.level ?? 1);

  const map: CustomFormulaWithDamage = useMemo(() => {
    if (spell)
      return mechanics && !isHealing
        ? spellDamageAtLevel(mechanics, castLevel)
        : {};
    return damage ?? {};
  }, [spell, mechanics, isHealing, castLevel, damage]);
  const healing = useMemo(
    () => (mechanics ? spellHealingAtLevel(mechanics, castLevel) : undefined),
    [mechanics, castLevel],
  );

  const [damageResult, setDamageResult] = useState<{
    parts: ReturnType<typeof rollDamage>;
    extras: {
      source: string;
      total: number;
      dice: number[];
      damageType?: DamageType;
    }[];
    total: number;
  } | null>(null);
  const [healResult, setHealResult] = useState<{
    total: number;
    dice: number[];
  } | null>(null);

  if (spell && !mechanics)
    return (
      <p className="muted">This spell has no structured effect to roll.</p>
    );

  const hasDamage = Object.keys(map).length > 0;
  const rollDamageEffect = () => {
    const parts = rollDamage(map, character, ridersFor(character, "damage"));
    // Fold in each active fixed extra: every always-on rider, plus opt-in ones
    // the player checked. Rolled on its own line so the source and type show.
    const extraResults = extras
      .filter(
        ({ source, rider }) =>
          !rider.slot && (!rider.optional || chosen.has(source)),
      )
      .map(({ source, rider }) => {
        const dice: number[] = [];
        return {
          source,
          total: rollFormula(rider.amount, character, dice),
          dice,
          damageType: rider.damageType,
        };
      });
    // The slot-powered extra rolls display dice here; the slot itself is spent
    // by its own button (not this re-rollable roll).
    if (smiteActive && slotExtra?.rider.slot) {
      const slot = slotExtra.rider.slot;
      const count =
        smiteDiceCount(slot, effSmiteLevel!) +
        (smiteBonus && slot.bonus ? slot.bonus.dice : 0);
      const dice: number[] = [];
      const total = rollFormula(
        [count, slot.die, DieOperation.roll],
        character,
        dice,
      );
      extraResults.push({
        source: slotExtra.source,
        total,
        dice,
        damageType: slotExtra.rider.damageType,
      });
    }
    const total =
      parts.reduce((s, p) => s + p.total, 0) +
      extraResults.reduce((s, e) => s + e.total, 0);
    setDamageResult({ parts, extras: extraResults, total });
  };
  // Spend the chosen slot that powers the smite (an explicit, one-time commit,
  // mirroring the hit-die apply — so it syncs/undoes like any edit).
  const expendSmite = () => {
    if (!smiteActive || smiteSpent || effSmiteLevel === undefined) return;
    const { updates } = resolveEffects([{ effect: "expendSlot" }], {
      character,
      chosenLevel: effSmiteLevel as LeveledSpellLevel,
    });
    updates.forEach((u) => dispatch(u));
    setSmiteSpent(true);
  };
  const rollHealEffect = () => {
    const dice: number[] = [];
    setHealResult({
      total: rollFormula(
        healing!,
        character,
        dice,
        ridersFor(character, "healing"),
      ),
      dice,
    });
  };

  return (
    <div className="column roll-section">
      {titled && (
        <p className="roll-section-title">{isHealing ? "Healing" : "Damage"}</p>
      )}
      {spell && mechanics && !isCantrip && !noSlots && (
        <label className="row roll-level-select">
          Cast at:{" "}
          <select
            value={castLevel}
            onChange={(e) => setSlotLevel(Number(e.target.value))}
          >
            {availableLevels.map((lvl) => (
              <option key={lvl} value={lvl}>
                {ordinalSlot(lvl)} level
              </option>
            ))}
          </select>
        </label>
      )}
      {noSlots && <p className="muted">No spell slots available.</p>}
      {isCantrip && (mechanics?.scaling || mechanics?.damageTable) && (
        <p className="muted">Scales with character level ({charLevel}).</p>
      )}

      {isHealing ? (
        <>
          <p className="roll-formula">
            {formatCustomFormula(healing!, character, false)}
          </p>
          <button
            className="btn-primary roll-go"
            disabled={noSlots}
            onClick={rollHealEffect}
          >
            Roll Healing
          </button>
          {healResult && (
            <div className="column roll-result">
              <span className="roll-total font-large">{healResult.total}</span>
              <span className="roll-part muted">
                HP
                {healResult.dice.length > 0
                  ? ` — dice: ${healResult.dice.join(" + ")}`
                  : ""}
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="roll-formula">
            {hasDamage
              ? formatCustomFormulaWithDamage(map, character, false)
              : "No damage dice"}
          </p>
          {extras.length > 0 && (
            <div className="column roll-extras">
              {extras.map(({ source, rider }) => {
                const toggle = (checked: boolean) =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(source);
                    else next.delete(source);
                    return next;
                  });
                // Slot-powered extra (Divine Smite): checkbox → slot selector +
                // situational-bonus toggle. Dice scale with the chosen level.
                if (rider.slot) {
                  const slot = rider.slot;
                  const checked = chosen.has(source);
                  const count =
                    effSmiteLevel !== undefined
                      ? smiteDiceCount(slot, effSmiteLevel) +
                        (smiteBonus && slot.bonus ? slot.bonus.dice : 0)
                      : slot.diceAtMin;
                  return (
                    <div key={source} className="column roll-extra">
                      <label className="row roll-extra-toggle">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={smiteLevels.length === 0}
                          onChange={(e) => toggle(e.target.checked)}
                        />
                        <span>
                          {source} ({count}
                          {dieLabel(slot.die)}
                          {rider.damageType ? ` ${rider.damageType}` : ""})
                        </span>
                      </label>
                      {smiteLevels.length === 0 ? (
                        <p className="muted font-small">
                          No spell slots available.
                        </p>
                      ) : (
                        checked && (
                          <>
                            <label className="row roll-extra-toggle">
                              Slot:{" "}
                              <select
                                value={effSmiteLevel}
                                onChange={(e) =>
                                  setSmiteLevel(Number(e.target.value))
                                }
                              >
                                {smiteLevels.map((l) => (
                                  <option key={l} value={l}>
                                    {ordinalSlot(l)} level
                                  </option>
                                ))}
                              </select>
                            </label>
                            {slot.bonus && (
                              <label className="row roll-extra-toggle">
                                <input
                                  type="checkbox"
                                  checked={smiteBonus}
                                  onChange={(e) =>
                                    setSmiteBonus(e.target.checked)
                                  }
                                />
                                <span>{slot.bonus.label}</span>
                              </label>
                            )}
                          </>
                        )
                      )}
                      {rider.note && (
                        <p className="muted font-small">{rider.note}</p>
                      )}
                    </div>
                  );
                }
                const label = `${source} (+${formatCustomFormula(rider.amount, character, false)}${rider.oncePerTurn ? ", once/turn" : ""})`;
                return rider.optional ? (
                  <div key={source} className="column roll-extra">
                    <label className="row roll-extra-toggle">
                      <input
                        type="checkbox"
                        checked={chosen.has(source)}
                        onChange={(e) => toggle(e.target.checked)}
                      />
                      <span>{label}</span>
                    </label>
                    {rider.note && (
                      <p className="muted font-small">{rider.note}</p>
                    )}
                  </div>
                ) : (
                  <p key={source} className="muted font-small">
                    {label}
                    {rider.note ? ` — ${rider.note}` : ""}
                  </p>
                );
              })}
            </div>
          )}
          <button
            className="btn-primary roll-go"
            disabled={!hasDamage || noSlots}
            onClick={rollDamageEffect}
          >
            Roll Damage
          </button>
          {damageResult && (
            <div className="column roll-result">
              <span className="roll-total font-large">
                {damageResult.total}
              </span>
              {damageResult.parts.map((p) => (
                <span key={p.damageType} className="roll-part">
                  {p.total} {p.damageType}
                  {p.dice.length > 1 ? ` (${p.dice.join(" + ")})` : ""}
                </span>
              ))}
              {damageResult.extras.map((e) => (
                <span key={e.source} className="roll-part">
                  +{e.total} {e.damageType ?? "(weapon type)"} — {e.source}
                  {e.dice.length > 1 ? ` (${e.dice.join(" + ")})` : ""}
                </span>
              ))}
              {smiteActive &&
                (smiteSpent ? (
                  <span className="roll-part muted">
                    {ordinalSlot(effSmiteLevel!)}-level slot expended
                  </span>
                ) : (
                  <button onClick={expendSmite}>
                    Expend {ordinalSlot(effSmiteLevel!)}-level slot
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Spend a hit die: roll 1d<die> + CON, then apply — heal current HP (clamped to
// max HP, with any minimum-total rider like Durable) and mark one die expended.
// The apply step goes through the mechanics resolver, so the writes are the
// same effect data any catalog action produces — and they sync/undo like any
// edit (play-mode dispatching is fine; the limited-use pips already do it).
function HitDieControls({
  character,
  die,
}: {
  character: Character;
  die: StandardDie;
}) {
  const { dispatch } = useCharacter();
  const formula: CustomFormula = useMemo(
    () => ({
      operation: Operation.addition,
      operands: [[1, die, DieOperation.roll], StatKey.con],
    }),
    [die],
  );
  const riders = useMemo(() => ridersFor(character, "hitDie"), [character]);
  const remaining = remainingHitDice(character, die);
  const [result, setResult] = useState<{
    total: number;
    dice: number[];
    applied: number | null;
  } | null>(null);

  const roll = () => {
    const dice: number[] = [];
    setResult({
      total: rollFormula(formula, character, dice, riders),
      dice,
      applied: null,
    });
  };

  const healing = result ? hitDieHealing(character, result.total) : 0;
  const gained = result
    ? Math.min(maxHpValue(character), character.currHp + healing) -
      character.currHp
    : 0;

  const apply = () => {
    if (!result || result.applied !== null) return;
    const { updates } = resolveEffects(
      [
        { effect: "heal", amount: { fixed: healing } },
        { effect: "spendHitDie", die },
      ],
      { character },
    );
    updates.forEach((update) => dispatch(update));
    setResult({ ...result, applied: gained });
  };

  return (
    <div className="column roll-section">
      <p className="roll-formula">
        {formatCustomFormula(formula, character, false)}
      </p>
      {remaining > 0 ? (
        <p className="muted">
          {remaining} {die} remaining
        </p>
      ) : (
        <p className="muted">No hit dice remaining.</p>
      )}
      <button
        className="btn-primary roll-go"
        disabled={remaining <= 0}
        onClick={roll}
      >
        Roll
      </button>
      {result && (
        <div className="column roll-result">
          <span className="roll-total font-large">{healing}</span>
          <span className="roll-part muted">
            HP — dice: {result.dice.join(" + ")}
            {healing > result.total && " (Durable minimum)"}
          </span>
          {result.applied !== null ? (
            <span className="roll-part">Applied +{result.applied} HP</span>
          ) : (
            <button
              onClick={apply}
              disabled={gained <= 0}
              title={gained <= 0 ? "Already at full HP" : undefined}
            >
              {gained < healing
                ? `Heal +${gained} HP (max) & spend 1 ${die}`
                : `Heal +${gained} HP & spend 1 ${die}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Roll a single dice formula on its own.
function FormulaControls({
  character,
  formula,
}: {
  character: Character;
  formula: CustomFormula;
}) {
  const [result, setResult] = useState<{
    total: number;
    dice: number[];
  } | null>(null);
  const roll = () => {
    const dice: number[] = [];
    setResult({ total: rollFormula(formula, character, dice), dice });
  };
  return (
    <div className="column roll-section">
      <p className="roll-formula">
        {formatCustomFormula(formula, character, false)}
      </p>
      <button className="btn-primary roll-go" onClick={roll}>
        Roll
      </button>
      {result && (
        <div className="column roll-result">
          <span className="roll-total font-large">{result.total}</span>
          {result.dice.length > 0 && (
            <span className="roll-part muted">
              dice: {result.dice.join(" + ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Shell({
  label,
  close,
  children,
}: React.PropsWithChildren<{ label: string; close: () => void }>) {
  return (
    <div className="modal-container">
      <div className="modal-background" onClick={close} />
      <div className="modal-content roll-modal">
        <div className="row space-between modal-titlebar">
          <b className="title font-large">Roll: {label}</b>
          <div className="modal-titlebar-buttons">
            <button className="icon-btn close" onClick={close}>
              x
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
