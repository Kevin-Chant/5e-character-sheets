import React from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { updateData } from "src/lib/hooks/reducers/actions";
import {
  DEFAULT_CUSTOM_ATTACK,
  WEAPON_PRESETS,
  WeaponPreset,
  buildAttackFromPreset,
} from "src/lib/rules";

export default function AddAttack() {
  const { character, dispatch } = useCharacter();
  const { replaceTargetedField } = useTargetedField();
  if (!character) return <></>;

  // Append the built attack and swap the picker for its editor (so closing the
  // editor without saving discards the new attack rather than orphaning it).
  const create = (preset: WeaponPreset) => {
    const newValue = structuredClone(character.attacks);
    newValue.push(buildAttackFromPreset(preset));
    dispatch(updateData(FIELD.attacks, { value: newValue }));
    replaceTargetedField(FIELD.attacks, (newValue.length - 1).toString());
  };

  return (
    <div className="column add-attack">
      <button
        className="btn-primary"
        onClick={(e) => {
          e.preventDefault();
          create(DEFAULT_CUSTOM_ATTACK);
        }}
      >
        Custom attack
      </button>
      {WEAPON_PRESETS.map((group) => (
        <div className="column" key={group.label}>
          <b>{group.label}</b>
          <div className="weapon-preset-grid">
            {group.options.map((weapon) => (
              <button
                key={weapon.name}
                onClick={(e) => {
                  e.preventDefault();
                  create(weapon);
                }}
              >
                {weapon.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
