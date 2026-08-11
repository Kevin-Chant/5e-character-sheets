import { FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import { DamageModifiers } from "src/lib/types";

const ROWS: Array<[keyof DamageModifiers, string]> = [
  ["resistances", "Resistances"],
  ["immunities", "Immunities"],
  ["vulnerabilities", "Vulnerabilities"],
];

const MODS = charPath(FIELD.damageModifiers);

// Damage resistances / immunities / vulnerabilities: three chip rows. Each
// entry is a free-text string (e.g. "nonmagical B/P/S"). In play mode empty
// categories are hidden; the whole box hides if there's nothing to show.
export default function DamageModifiersDisplay() {
  const { character, dispatch } = useLoadedCharacter();
  const { editMode } = useEditMode();
  const { pushCursor } = useTargetedField();

  const mods = character.damageModifiers;
  const visibleRows = editMode
    ? ROWS
    : ROWS.filter(([key]) => mods[key].length > 0);
  if (visibleRows.length === 0) return <></>;

  // Collapse to a strip when all three are empty; its "+" opens Resistances.
  if (ROWS.every(([key]) => mods[key].length === 0)) {
    return (
      <div className="column rounded-border-box other-proficiencies section-empty">
        <b className="section-heading pos-relative margin-large">
          Damage Modifiers
          <button
            className="section-add"
            aria-label="Add a damage resistance"
            onClick={(e) => {
              e.preventDefault();
              pushCursor(MODS.k("resistances").at(0));
            }}
          >
            +
          </button>
        </b>
      </div>
    );
  }

  return (
    <div className="column rounded-border-box other-proficiencies">
      {visibleRows.map(([key, label]) => {
        const list = MODS.k(key);
        const items = mods[key];
        const remove = (index: number) => {
          const next = items.slice();
          next.splice(index, 1);
          dispatch(updateAt(list, next));
        };
        return (
          <div className="prof-row" key={key}>
            <div className="prof-label">{label}</div>
            <div className="prof-values">
              {items.map((item, i) => (
                <span key={i} className="prof-chip">
                  <button
                    className="prof-chip-label"
                    onClick={(e) => {
                      e.preventDefault();
                      pushCursor(list.at(i));
                    }}
                  >
                    {item}
                    {i < items.length - 1 ? "," : ""}
                  </button>
                  {editMode && (
                    <button
                      className="prof-chip-remove"
                      aria-label={`Remove ${item}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        remove(i);
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {editMode && (
                <button
                  className="prof-add"
                  aria-label={`Add ${label.toLowerCase()}`}
                  onClick={(e) => {
                    e.preventDefault();
                    pushCursor(list.at(items.length));
                  }}
                >
                  +
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div className="prof-title">Damage Modifiers</div>
    </div>
  );
}
