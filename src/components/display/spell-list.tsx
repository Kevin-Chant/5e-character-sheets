import { FaPencil } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { Spell, isTextComponentWithDetail } from "src/lib/types";
import { Cursor, updateAt } from "src/lib/cursor";
import { getFieldValue } from "src/lib/fields";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";
import RollButton from "../roll-button";
import { getSpellAttackBonus } from "src/lib/formula";
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
  // Cursor to this bucket within `character.spells` (the "cantrips" or a
  // SpellLevel array). Optional since a level's array may not exist yet.
  bucket: Cursor<Spell[] | undefined>;
  // Cantrips are never prepared, so the prepared toggle is hidden for them.
  preparable: boolean;
  // Show the originating class on each spell (only useful when multiclassing).
  showClassBadge: boolean;
}

export default function SpellList({
  bucket,
  preparable,
  showClassBadge,
}: SpellListProps) {
  const { character, dispatch } = useCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();
  if (!character) return <></>;

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

  // Open the editor on the next (empty) index; EditSpell seeds a blank spell
  // into the modal draft, so nothing is persisted until the user saves.
  const addSpell = () => pushCursor(bucket.at(spells.length));

  // Open the SRD browser for this level; the ".new" sentinel routes to the
  // picker, which appends the chosen spell itself (see charsheet.tsx /
  // add-spell-from-srd.tsx).
  const browseSrd = () => pushCursor(bucket.append());

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
        const rollable =
          spell.mechanics?.damage ||
          spell.mechanics?.damageTable ||
          spell.mechanics?.healing;
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
                    title="Prepared"
                    aria-label="Prepared"
                    checked={!!spell.prepared}
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
              {/* School as a single letter (A/C/D/En/Ev/I/N/T), spelled out on
                  hover — full names would crowd the row. */}
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
                    x
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
              browseSrd();
            }}
          >
            Browse SRD
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
