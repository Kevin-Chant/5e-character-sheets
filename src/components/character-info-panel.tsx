import { FIELD } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import MultiLineTextDisplay from "./display/multi-line-text-display";

export default function CharacterInfoPanel() {
  const { character } = useCharacter();
  if (!character) return <></>;
  return (
    <div className="column">
      <MultiLineTextDisplay
        title="Personality Traits"
        field={FIELD["personality.traits"]}
      />
      <MultiLineTextDisplay
        title="Ideals"
        field={FIELD["personality.ideals"]}
      />
      <MultiLineTextDisplay title="Bonds" field={FIELD["personality.bonds"]} />
      <MultiLineTextDisplay title="Flaws" field={FIELD["personality.flaws"]} />
      <MultiLineTextDisplay title="Features & Traits" field={FIELD.features} />
    </div>
  );
}
