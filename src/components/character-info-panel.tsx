import { useCharacter } from "src/lib/hooks/use-character";
import MultiLineTextDisplay from "./display/multi-line-text-display";
import { FIELD } from "src/lib/data/data-definitions";

export default function CharacterInfoPanel() {
  const { character } = useCharacter();
  if (!character) return <></>;
  return (
    <div className="column">
      <MultiLineTextDisplay
        title="Personality Traits"
        field={FIELD.personality}
        subField="traits"
      />
      <MultiLineTextDisplay
        title="Ideals"
        field={FIELD.personality}
        subField="ideals"
      />
      <MultiLineTextDisplay
        title="Bonds"
        field={FIELD.personality}
        subField="bonds"
      />
      <MultiLineTextDisplay
        title="Flaws"
        field={FIELD.personality}
        subField="flaws"
      />
      <MultiLineTextDisplay title="Features & Traits" field={FIELD.features} />
    </div>
  );
}
