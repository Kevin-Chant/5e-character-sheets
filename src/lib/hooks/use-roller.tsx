import React, { useContext, useState } from "react";
import { randomUUID } from "src/lib/browser";
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
  // A death saving throw: a flat d20 that reads its own outcome (10 or better
  // is a success, a nat 1 costs two failures, a nat 20 puts you back up) and
  // offers to write it onto the pips. Its own kind rather than a `check` with
  // modifier 0 because none of that arithmetic belongs to the player, and
  // because it is the roll a table most wants made in the open.
  | { kind: "deathSave" }
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
  // Identity for *this opening of the dialog*. Two jobs: it keys the dialog's
  // contents, so yesterday's result can't linger in a freshly opened one (the
  // components sit at the same tree position and would otherwise be reused),
  // and it is the `exchangeId` every roll made inside is reported under — the
  // to-hit and the damage of one swing are one act, and the DM reads them as
  // one card.
  id: string;
  label: string;
  spec: RollSpec;
}

interface RollerContextData {
  request: RollRequest | null;
  openRoller: (request: Omit<RollRequest, "id">) => void;
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
        openRoller: (opened) => setRequest({ ...opened, id: randomUUID() }),
        closeRoller: () => setRequest(null),
      }}
    >
      {props.children}
    </RollerContext.Provider>
  );
}

export const useRoller = () => useContext(RollerContext);
