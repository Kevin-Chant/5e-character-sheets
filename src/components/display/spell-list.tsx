import { FaPencil } from "react-icons/fa6";
import { updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { FIELD } from "src/lib/data/data-definitions";
import { Spell, isTextComponentWithDetail } from "src/lib/types";
import { getFieldValue, traverse } from "src/lib/fields";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";
import RollButton from "../roll-button";
import { getSpellAttackBonus } from "src/lib/formula";
import { isPreparedCaster } from "src/lib/rules";

interface SpellListProps {
  // Sub-path within `character.spells`, e.g. "cantrips" or a SpellLevel.
  subField: string;
  defaultValue: Spell;
  // Cantrips are never prepared, so the prepared toggle is hidden for them.
  preparable: boolean;
  // Show the originating class on each spell (only useful when multiclassing).
  showClassBadge: boolean;
}

export default function SpellList({
  subField,
  defaultValue,
  preparable,
  showClassBadge,
}: SpellListProps) {
  const { character, dispatch } = useCharacter();
  const { pushTargetedField } = useTargetedField();
  const { editMode } = useEditMode();
  if (!character) return <></>;

  const spells: Spell[] =
    traverse(subField, getFieldValue(FIELD.spells, character)) ?? [];

  const editSpell = (index: number) =>
    pushTargetedField(FIELD.spells, `${subField}.${index}`);

  const removeSpell = (index: number) => {
    const newValue = spells.filter((_, i) => i !== index);
    dispatch(updateData(FIELD.spells, { value: newValue }, subField));
  };

  const addSpell = () => {
    dispatch(
      updateData(
        FIELD.spells,
        { value: spells.concat(defaultValue) },
        subField,
      ),
    );
    pushTargetedField(FIELD.spells, `${subField}.${spells.length}`);
  };

  // Open the SRD browser for this level; ".new" routes to the picker, which
  // appends the chosen spell itself (see charsheet.tsx / add-spell-from-srd.tsx).
  const browseSrd = () => pushTargetedField(FIELD.spells, `${subField}.new`);

  const togglePrepared = (index: number, prepared: boolean) =>
    dispatch(
      updateData(
        FIELD.spells,
        { value: prepared },
        `${subField}.${index}.prepared`,
      ),
    );

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
              {preparable && isPreparedCaster(spell.spellcastingClass) && (
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
                  {spell.spellcastingClass}
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
