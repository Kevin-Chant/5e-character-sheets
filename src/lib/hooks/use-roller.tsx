import React, { useContext, useState } from "react";
import { CustomFormula, CustomFormulaWithDamage, Spell } from "src/lib/types";

// What a roll button asks the roller to roll.
export type RollSpec =
  // A d20 + flat modifier check (skills, saves, ability checks, initiative).
  // Supports advantage/disadvantage.
  | { kind: "check"; modifier: number }
  // A single dice formula rolled on its own (e.g. a hit die).
  | { kind: "formula"; formula: CustomFormula }
  // Using a weapon or spell: an optional to-hit roll and its damage, handled
  // together in one dialog. `spell` carries the model so the modal can offer a
  // cast-level selector and expand scaling; otherwise `damage` is fixed.
  | {
      kind: "attack";
      toHit?: number;
      damage?: CustomFormulaWithDamage;
      spell?: Spell;
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
