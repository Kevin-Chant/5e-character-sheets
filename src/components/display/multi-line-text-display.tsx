import { FIELD, updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { TextComponent, isArr, isTextComponent } from "src/lib/types";
import { getFieldValue } from "src/lib/utils";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";

interface MultiLineTextDisplayProps {
  title: string;
  field: FIELD;
}

export default function MultiLineTextDisplay({
  title,
  field,
}: MultiLineTextDisplayProps) {
  const { character, dispatch } = useCharacter();

  if (!character) return <></>;

  const textComponents = getFieldValue(field, character);
  if (!isArr<TextComponent>(textComponents, isTextComponent)) return <></>;

  const removeTextComponent = (index: number) => {
    const newValue = JSON.parse(JSON.stringify(textComponents));
    newValue.splice(index, 1);
    dispatch(updateData(field, { value: newValue }));
  };

  const addTextComponent = () => {
    dispatch(
      updateData(field, {
        value: textComponents.concat({ title: "new field" }),
      })
    );
  };

  return (
    <div className="column rounded-border-box">
      {textComponents.map((textComponent, i) => {
        const hasPopover = !!textComponent.detail;
        const titleComponent = hasPopover ? (
          <ComponentWithPopover
            componentChildren={
              <TextWithFormulasDisplay templateString={textComponent.title} />
            }
            popoverChildren={
              <TextWithFormulasDisplay
                templateString={textComponent.detail as string}
              />
            }
          />
        ) : (
          <TextWithFormulasDisplay templateString={textComponent.title} />
        );
        return (
          <div key={i} className="row">
            {titleComponent}
            <button
              onClick={(e) => {
                e.preventDefault();
                removeTextComponent(i);
              }}
            >
              x
            </button>
          </div>
        );
      })}
      <b className="pos-relative margin-large">
        {title}
        <button
          style={{
            position: "absolute",
            top: "-50%",
            right: "0px",
            transform: "translate(150%, 0%)",
          }}
          onClick={(e) => {
            e.preventDefault();
            addTextComponent();
          }}
        >
          +
        </button>
      </b>
    </div>
  );
}
