import { FaPencil, FaXmark } from "react-icons/fa6";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { Spell, isTextComponentWithDetail } from "src/lib/types";
import { Cursor, updateAt } from "src/lib/cursor";
import { getFieldValue } from "src/lib/fields";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";
import RollButton from "../roll-button";
import { getSpellAttackBonus } from "src/lib/formula";
import { rollableSpell } from "src/lib/attack-roll";
import { classNameForId, isPreparedCaster } from "src/lib/rules";

// A school's badge letter. Enchantment/Evocation share an initial, so both take
// two letters; a homebrew school falls back to its own first letter.
const SCHOOL_ABBREVIATIONS: Record<string, string> = {
  Abjuration: "A",
  Conjuration: "C",
  Divination: "D",
  Enchantment: "En",
  Evocation: "Ev",
  Illusion: "I",
  Necromancy: "N",
  Transmutation: "T",
};

const schoolAbbreviation = (school: string): string =>
  SCHOOL_ABBREVIATIONS[school] ?? school.charAt(0).toUpperCase();

interface SpellListProps {
  bucket: Cursor<Spell[] | undefined>;
  // Cantrips are never prepared, so the prepared toggle is hidden for them.
  preparable: boolean;
  showClassBadge: boolean;
}

export default function SpellList({
  bucket,
  preparable,
  showClassBadge,
}: SpellListProps) {
  const { character, dispatch } = useLoadedCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();

  const spells: Spell[] = getFieldValue(bucket.toString(), character) ?? [];

  const editSpell = (index: number) => pushCursor(bucket.at(index));

  const removeSpell = (index: number) => {
    dispatch(
      updateAt(
        bucket,
        spells.filter((_, i) => i !== index),
      ),
    );
  };

  const addSpell = () => pushCursor(bucket.at(spells.length));

  const browseCatalog = () => pushCursor(bucket.append());

  const togglePrepared = (index: number, prepared: boolean) =>
    dispatch(updateAt(bucket.at(index).k("prepared"), prepared));

  return (
    <div className="column rounded-border-box">
      {spells.map((spell, i) => {
        const info = spell.info;
        const title = isTextComponentWithDetail(info) ? (
          <ComponentWithPopover
            componentClass="rounded-border-box pos-relative padding-small editable"
            componentChildren={
              <TextWithFormulasDisplay
                templateString={info.title}
                formulas={info.titleFormulas}
              />
            }
            popoverChildren={
              <TextWithFormulasDisplay
                templateString={info.detail}
                formulas={info.detailFormulas}
              />
            }
          />
        ) : (
          <TextWithFormulasDisplay
            templateString={info.title}
            formulas={info.titleFormulas}
          />
        );
        const rollable = rollableSpell(spell);
        return (
          <div key={i} className="row space-between spell-row">
            <div className="row spell-row-main">
              {preparable &&
                isPreparedCaster(
                  classNameForId(character, spell.spellcastingClass) ?? "",
                ) && (
                  <input
                    type="checkbox"
                    className="prepared-toggle"
                    title={
                      spell.alwaysPrepared
                        ? "Always prepared — doesn't count against your allowance"
                        : "Prepared"
                    }
                    aria-label={
                      spell.alwaysPrepared ? "Always prepared" : "Prepared"
                    }
                    checked={!!spell.prepared}
                    // An always-prepared spell can't be un-prepared, so the
                    // tick is a statement rather than a control.
                    disabled={spell.alwaysPrepared}
                    onChange={(e) => togglePrepared(i, e.target.checked)}
                  />
                )}
              {title}
              {showClassBadge && (
                <span className="spell-badge class-badge">
                  {classNameForId(character, spell.spellcastingClass) ??
                    "Unknown"}
                </span>
              )}
              {spell.school && (
                <span className="spell-badge school-badge" title={spell.school}>
                  {schoolAbbreviation(spell.school)}
                </span>
              )}
              {spell.ritual && (
                <span className="spell-badge" title="Ritual">
                  R
                </span>
              )}
              {spell.concentration && (
                <span className="spell-badge" title="Concentration">
                  C
                </span>
              )}
            </div>
            <div className="flex spell-row-actions">
              {editMode ? (
                <>
                  <button
                    type="button"
                    aria-label="Edit spell"
                    onClick={(e) => {
                      e.preventDefault();
                      editSpell(i);
                    }}
                  >
                    <FaPencil />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove spell"
                    onClick={(e) => {
                      e.preventDefault();
                      removeSpell(i);
                    }}
                  >
                    <FaXmark />
                  </button>
                </>
              ) : (
                rollable && (
                  <RollButton
                    label={spell.info.title}
                    toHit={
                      spell.mechanics?.resolution?.kind === "attack"
                        ? getSpellAttackBonus(
                            character,
                            spell.spellcastingClass,
                          )
                        : undefined
                    }
                    spell={spell}
                  />
                )
              )}
            </div>
          </div>
        );
      })}
      {editMode && (
        <div className="row spell-add-actions">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              browseCatalog();
            }}
          >
            Browse Spells
          </button>
          <button
            type="button"
            aria-label="Add blank spell"
            onClick={(e) => {
              e.preventDefault();
              addSpell();
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
