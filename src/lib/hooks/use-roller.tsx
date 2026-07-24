import React, { useContext, useState } from "react";
import { StandardDie } from "src/lib/data/data-definitions";
import {
  Attack,
  CustomFormula,
  CustomFormulaWithDamage,
  SaveEffect,
  Spell,
} from "src/lib/types";

// What a roll button asks the roller to roll.
export type RollSpec =
  // A d20 + flat modifier check (skills, saves, ability checks, initiative).
  // Supports advantage/disadvantage.
  | { kind: "check"; modifier: number }
  // A single dice formula rolled on its own.
  | { kind: "formula"; formula: CustomFormula }
  // Spending a hit die: rolls 1d<die> + CON, then offers to apply the healing
  // to current HP and mark the die expended. Declarative (rather than an
  // afterRoll callback) so the modal can gate on the live character — remaining
  // dice, max-HP clamp, Durable's minimum.
  | { kind: "hitDie"; die: StandardDie }
  // Using a weapon or spell: an optional to-hit roll and its damage, handled
  // together in one dialog. `spell` carries the model so the modal can offer a
  // cast-level selector and expand scaling; otherwise `damage` is fixed.
  // `save` is the alternative to `toHit` — the target rolls instead of the
  // character, so the dialog shows the DC and (for `onSuccess: "half"`) the
  // halved damage alongside the full total.
  // `attack` is the sheet entry this came from, carried purely for its weapon
  // properties: the roll dialog reads `tags` and the to-hit formula's ability to
  // decide which riders apply (Archery on a bow, Rage on a melee Strength hit).
  // Absent for a spell attack, whose riders stay undecidable by design — a
  // fighting style is a *weapon* feature, so "unknown" correctly leaves it as a
  // prompt rather than auto-applying it to Fire Bolt.
  | {
      kind: "attack";
      toHit?: number;
      save?: SaveEffect;
      damage?: CustomFormulaWithDamage;
      spell?: Spell;
      attack?: Attack;
    };

export interface RollRequest {
  label: string;
  spec: RollSpec;
}

interface RollerContextData {
  request: RollRequest | null;
  openRoller: (request: RollRequest) => void;
  closeRoller: () => void;
}

// Rolling is a play-mode, read-only action, so it lives outside the edit-gated
// targeted-field stack (see use-targeted-field.tsx). This is its own tiny modal
// channel — at most one roll dialog open at a time.
const RollerContext = React.createContext<RollerContextData>({
  request: null,
  openRoller: () => {},
  closeRoller: () => {},
});

export function RollerProvider(props: React.PropsWithChildren) {
  const [request, setRequest] = useState<RollRequest | null>(null);
  return (
    <RollerContext.Provider
      value={{
        request,
        openRoller: setRequest,
        closeRoller: () => setRequest(null),
      }}
    >
      {props.children}
    </RollerContext.Provider>
  );
}

export const useRoller = () => useContext(RollerContext);
