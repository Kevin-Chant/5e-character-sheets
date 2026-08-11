import { useState } from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import { randomUUID } from "src/lib/browser";
import { Ammunition } from "src/lib/types";
import { useSave } from "./modals/modal-container";

// Add or edit one ammunition pool. subField "new" appends, a numeric index
// edits that pool. `weaponIds` links the pool to attacks via checkboxes. The
// whole entry commits as one action on save, so cancelling discards it.
export default function EditAmmunition() {
  const { character } = useLoadedCharacter();
  const { subField } = useTargetedField();
  const { saveData } = useSave();

  const isNew = subField === "new" || subField === undefined;
  const ammo = character?.ammunition ?? [];
  const index = isNew ? -1 : Number(subField);
  const existing: Ammunition | undefined = isNew ? undefined : ammo[index];

  const [name, setName] = useState(existing?.name ?? "");
  const [count, setCount] = useState<number>(existing?.count ?? 0);
  const [weaponIds, setWeaponIds] = useState<string[]>(
    existing?.weaponIds ?? [],
  );

  const toggleWeapon = (id: string) =>
    setWeaponIds((ids) =>
      ids.includes(id) ? ids.filter((w) => w !== id) : [...ids, id],
    );

  const save = () => {
    const entry: Ammunition = {
      id: existing?.id ?? randomUUID(),
      name: name.trim() || "Ammunition",
      count: Math.max(0, count || 0),
      // Drop links to weapons that no longer exist.
      weaponIds: weaponIds.filter((id) =>
        character.attacks.some((a) => a.id === id),
      ) as Ammunition["weaponIds"],
    };
    const action = isNew
      ? updateAt(charPath(FIELD.ammunition), [...ammo, entry])
      : updateAt(charPath(FIELD.ammunition).at(index), entry);
    saveData(undefined, action);
  };

  return (
    <form
      className="edit-ammunition column"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="field">
        <span className="field-label">Name</span>
        <input
          type="text"
          value={name}
          autoFocus
          placeholder="e.g. Arrows, Crossbow Bolts"
          // Keep password managers off this field; they mistake "Name" for identity.
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Count</span>
        <input
          type="number"
          value={count}
          min={0}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </label>
      <fieldset className="ammo-weapons">
        <legend className="field-label">Used by</legend>
        {character.attacks.length === 0 ? (
          <span className="hint">Add a weapon attack first to link it.</span>
        ) : (
          character.attacks.map((attack) => (
            <label className="settings-checkbox" key={attack.id}>
              <input
                type="checkbox"
                checked={weaponIds.includes(attack.id)}
                onChange={() => toggleWeapon(attack.id)}
              />
              {attack.name}
            </label>
          ))
        )}
      </fieldset>
      <button
        className="btn-primary edit-save"
        onClick={(e) => {
          e.preventDefault();
          save();
        }}
      >
        Save
      </button>
    </form>
  );
}
