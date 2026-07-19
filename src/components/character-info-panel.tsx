import { useCharacter } from "src/lib/hooks/use-character";
import MultiLineTextDisplay from "./display/multi-line-text-display";
import LimitedUseAbilitiesDisplay from "./display/limited-use-abilities-display";
import { FIELD } from "src/lib/data/data-definitions";
import { charPath } from "src/lib/cursor";

export default function CharacterInfoPanel() {
  const { character } = useCharacter();
  if (!character) return <></>;
  return (
    <div className="column">
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
      <MultiLineTextDisplay
        title="Features & Traits"
        cursor={charPath(FIELD.features)}
      />
      <LimitedUseAbilitiesDisplay />
    </div>
  );
}
