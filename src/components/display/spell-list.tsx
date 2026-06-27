import { FaPencil } from "react-icons/fa6";
import { updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { FIELD } from "src/lib/data/data-definitions";
import { Spell, isTextComponentWithDetail } from "src/lib/types";
import { getFieldValue, traverse } from "src/lib/fields";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";

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
        return (
          <div key={i} className="row space-between spell-row">
            <div className="row spell-row-main">
              {preparable && (
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
            <div className="flex">
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
            </div>
          </div>
        );
      })}
      <b className="pos-relative margin-large">
        <button
          style={{
            position: "absolute",
            top: "-50%",
            right: "0px",
            transform: "translate(150%, 0%)",
          }}
          onClick={(e) => {
            e.preventDefault();
            addSpell();
          }}
        >
          +
        </button>
      </b>
    </div>
  );
}
