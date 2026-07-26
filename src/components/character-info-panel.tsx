import MultiLineTextDisplay from "./display/multi-line-text-display";
import SensesDisplay from "./display/senses-display";
import DamageModifiersDisplay from "./display/damage-modifiers-display";
import LimitedUseAbilitiesDisplay from "./display/limited-use-abilities-display";
import ChosenOptionsDisplay from "./display/chosen-options-display";
import { FIELD } from "src/lib/data/data-definitions";
import { charPath } from "src/lib/cursor";
import { useSettings } from "src/lib/hooks/use-settings";

export default function CharacterInfoPanel() {
  const {
    settings: { trackPersonality },
  } = useSettings();
  return (
    <div className="column">
      {/* Four sections, one question — whether this table plays with them at
          all. Hidden together so the rest of the column keeps its order; the
          stored traits are untouched and come back with the setting. */}
      {trackPersonality && (
        <>
          <MultiLineTextDisplay
            title="Personality Traits"
            cursor={charPath(FIELD.personality).k("traits")}
          />
          <MultiLineTextDisplay
            title="Ideals"
            cursor={charPath(FIELD.personality).k("ideals")}
          />
          <MultiLineTextDisplay
            title="Bonds"
            cursor={charPath(FIELD.personality).k("bonds")}
          />
          <MultiLineTextDisplay
            title="Flaws"
            cursor={charPath(FIELD.personality).k("flaws")}
          />
        </>
      )}
      {/* The longest list on the sheet — 18 one-line names on a mid-level
          multiclass. Flowed into columns rather than run single-file. */}
      <MultiLineTextDisplay
        title="Features & Traits"
        cursor={charPath(FIELD.features)}
        flowEntries
      />
      <SensesDisplay />
      <DamageModifiersDisplay />
      <ChosenOptionsDisplay />
      <LimitedUseAbilitiesDisplay />
    </div>
  );
}
