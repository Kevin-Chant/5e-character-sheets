import { useMemo, useState } from "react";
import {
  formatCustomFormula,
  formatCustomFormulaWithDamage,
} from "src/lib/formula";
import { useCharacter } from "src/lib/hooks/use-character";
import { useRoller } from "src/lib/hooks/use-roller";
import { CheckMode, rollD20Check, rollDamage, rollFormula } from "src/lib/roll";
import {
  spellDamageAtLevel,
  spellHealingAtLevel,
} from "src/lib/spells/spell-scaling";
import { availableSpellSlots } from "src/lib/rules";
import { SpellLevel } from "src/lib/data/data-definitions";
import {
  Character,
  CustomFormula,
  CustomFormulaWithDamage,
  Spell,
} from "src/lib/types";

// SpellLevel enum values indexed by numeric level (index 0 = 1st).
const SPELL_LEVELS = Object.values(SpellLevel) as SpellLevel[];

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
      {spec.kind === "check" && <CheckControls modifier={spec.modifier} />}
      {spec.kind === "formula" && (
        <FormulaControls character={character} formula={spec.formula} />
      )}
      {spec.kind === "attack" && (
        <>
          {spec.toHit !== undefined && (
            <CheckControls label="To Hit" modifier={spec.toHit} />
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

// A d20 + modifier roll with advantage/disadvantage. Reused as a standalone
// check and as the "To Hit" half of an attack.
function CheckControls({
  modifier,
  label,
}: {
  modifier: number;
  label?: string;
}) {
  const [result, setResult] = useState<ReturnType<typeof rollD20Check> | null>(
    null,
  );
  const roll = (mode: CheckMode) => setResult(rollD20Check(modifier, mode));
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
      {result && (
        <div className="column roll-result">
          <span className="roll-total font-large">{result.total}</span>
          <span className="roll-part muted">
            d20{" "}
            {result.dice.length > 1
              ? `(${result.dice.join(", ")} → ${result.kept})`
              : `(${result.kept})`}{" "}
            {signed(result.modifier)}
          </span>
        </div>
      )}
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

  // Only offer slot levels the character actually has unspent (and at/above the
  // spell's base level). Cantrips use no slots, so this is empty for them.
  const availableLevels = useMemo(() => {
    if (!mechanics || isCantrip) return [];
    const out: number[] = [];
    for (let lvl = mechanics.level; lvl <= 9; lvl++)
      if (availableSpellSlots(character, SPELL_LEVELS[lvl - 1]) > 0)
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
    const parts = rollDamage(map, character);
    setDamageResult({ parts, total: parts.reduce((s, p) => s + p.total, 0) });
  };
  const rollHealEffect = () => {
    const dice: number[] = [];
    setHealResult({ total: rollFormula(healing!, character, dice), dice });
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
      {isCantrip && (
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
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Roll a single dice formula (e.g. a hit die).
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
