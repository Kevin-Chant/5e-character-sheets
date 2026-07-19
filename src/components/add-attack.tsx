import React from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import {
  DEFAULT_CUSTOM_ATTACK,
  WEAPON_PRESETS,
  WeaponPreset,
  buildAttackFromPreset,
} from "src/lib/rules";

export default function AddAttack() {
  const { character, dispatch } = useCharacter();
  const { replaceCursor } = useTargetedField();
  if (!character) return <></>;

  // Append the built attack and swap the picker for its editor (so closing the
  // editor without saving discards the new attack rather than orphaning it).
  const create = (preset: WeaponPreset, twoHanded = false) => {
    const attacks = charPath(FIELD.attacks);
    const newValue = structuredClone(character.attacks);
    newValue.push(buildAttackFromPreset(preset, twoHanded));
    dispatch(updateAt(attacks, newValue));
    replaceCursor(attacks.at(newValue.length - 1));
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
              <React.Fragment key={weapon.name}>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    create(weapon);
                  }}
                >
                  {weapon.name}
                </button>
                {weapon.damage?.versatileDie && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      create(weapon, true);
                    }}
                  >
                    {weapon.name} (2H)
                  </button>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
