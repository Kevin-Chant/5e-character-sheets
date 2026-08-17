import React, { useContext, useState } from "react";
import { randomUUID } from "src/lib/browser";
import { HitDie, SkillName } from "src/lib/data/data-definitions";
import {
  Attack,
  CustomFormula,
  CustomFormulaWithDamage,
  SaveEffect,
  Spell,
} from "src/lib/types";

// What a roll button asks the roller to roll.
export type RollSpec =
  // d20 + flat modifier (skills, saves, checks, initiative); `save: true`
  // marks a saving throw so save-only riders (Bless's d4) apply correctly.
  // `skill`/`proficient` name which check it is, so skill-scoped riders
  // (Silver Tongue) and proficiency-scoped ones (Reliable Talent) can decide.
  | {
      kind: "check";
      modifier: number;
      save?: boolean;
      skill?: SkillName;
      proficient?: boolean;
    }
  | { kind: "formula"; formula: CustomFormula }
  // Spending a hit die: rolls 1d<die>+CON, offers to apply healing and mark
  // the die expended. Declarative so the modal can gate on the live
  // character (remaining dice, max-HP clamp, Durable's minimum).
  | { kind: "hitDie"; die: HitDie }
  // A death save: reads its own outcome (10+ success, nat 1 two failures,
  // nat 20 stabilizes) and offers to write it onto the pips.
  | { kind: "deathSave" }
  // A weapon/spell attack: optional to-hit + damage in one dialog. `spell`
  // carries the model for cast-level/scaling; `save` is the DC alternative
  // to `toHit`. `attack` carries the sheet entry's weapon properties (tags,
  // to-hit formula) so the dialog can decide which riders apply — absent for
  // spell attacks, whose weapon-only riders (e.g. Archery) stay unresolved.
  | {
      kind: "attack";
      toHit?: number;
      save?: SaveEffect;
      damage?: CustomFormulaWithDamage;
      spell?: Spell;
      attack?: Attack;
    };

export interface RollRequest {
  // Identity for this opening of the dialog: keys its contents (avoids reuse
  // at the same tree position) and is the `exchangeId` every roll inside is reported under.
  id: string;
  label: string;
  spec: RollSpec;
  // Attempt numbering start; nonzero when re-opened onto an existing exchange
  // so a re-roll doesn't report "attempt 1" again.
  attemptBase?: number;
}

interface RollerContextData {
  request: RollRequest | null;
  // `id` aims the dialog at an existing exchange (e.g. answering a roll
  // call); omitted, each opening is its own exchange.
  openRoller: (request: Omit<RollRequest, "id"> & { id?: string }) => void;
  closeRoller: () => void;
}

// Play-mode, read-only, so it lives outside the edit-gated targeted-field
// stack. At most one roll dialog open at a time.
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
        openRoller: (opened) =>
          setRequest({ ...opened, id: opened.id ?? randomUUID() }),
        closeRoller: () => setRequest(null),
      }}
    >
      {props.children}
    </RollerContext.Provider>
  );
}

export const useRoller = () => useContext(RollerContext);
