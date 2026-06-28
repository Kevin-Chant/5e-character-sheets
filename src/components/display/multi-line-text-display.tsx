import { updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  Character,
  TextComponent,
  isArr,
  isTextComponent,
  isTextComponentWithDetail,
} from "src/lib/types";
import { getFieldValue, traverse } from "src/lib/fields";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";
import { FaPencil } from "react-icons/fa6";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { FIELD } from "src/lib/data/data-definitions";

interface MultiLineTextDisplayProps {
  title: string;
  field: FIELD;
  subField?: string;
  transform?: (data: any, character: Character) => any;
}

export default function MultiLineTextDisplay({
  title,
  field,
  subField,
  transform,
}: MultiLineTextDisplayProps) {
  const { character, dispatch } = useCharacter();
  const { pushTargetedField } = useTargetedField();
  const { editMode } = useEditMode();

  if (!character) return <></>;

  let textComponents = getFieldValue(field, character);
  if (subField) textComponents = traverse(subField, textComponents);
  let renderedTextComponents = textComponents;
  if (transform && textComponents) {
    renderedTextComponents = textComponents.map((element: any) =>
      transform(element, character),
    );
  }
  if (!isArr<TextComponent>(renderedTextComponents, isTextComponent))
    return <></>;

  const editTextComponent = (index: number) => {
    if (subField) {
      pushTargetedField(field, `${subField}.${index}`);
    } else {
      pushTargetedField(field, index.toString());
    }
  };

  const removeTextComponent = (index: number) => {
    const newValue = structuredClone(textComponents);
    newValue.splice(index, 1);
    dispatch(updateData(field, { value: newValue }, subField));
  };

  // Open the editor at the next (empty) index; the entry is only persisted when
  // the user saves, so no placeholder is written up-front.
  const addTextComponent = () => editTextComponent(textComponents.length);

  return (
    <div className="column rounded-border-box">
      {renderedTextComponents.map((textComponent, i) => {
        const titleComponent = isTextComponentWithDetail(textComponent) ? (
          <ComponentWithPopover
            componentChildren={
              <TextWithFormulasDisplay
                templateString={textComponent.title}
                formulas={textComponent.titleFormulas}
              />
            }
            popoverChildren={
              <TextWithFormulasDisplay
                templateString={textComponent.detail}
                formulas={textComponent.detailFormulas}
              />
            }
          />
        ) : (
          <TextWithFormulasDisplay
            templateString={textComponent.title}
            formulas={textComponent.titleFormulas}
          />
        );
        return (
          <div key={i} className="row space-between">
            {titleComponent}
            {editMode && (
              <div className="flex">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    editTextComponent(i);
                  }}
                >
                  <FaPencil />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    removeTextComponent(i);
                  }}
                >
                  x
                </button>
              </div>
            )}
          </div>
        );
      })}
      <b className="pos-relative margin-large">
        {title}
        {editMode && (
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
        )}
      </b>
    </div>
  );
}
