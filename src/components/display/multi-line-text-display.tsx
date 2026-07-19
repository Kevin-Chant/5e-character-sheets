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
import { Cursor, fromStack, updateAt } from "src/lib/cursor";

interface MultiLineTextDisplayProps {
  title: string;
  // Typed cursor to the TextComponent array is preferred; `field`/`subField` are
  // the legacy string form for not-yet-migrated call sites.
  cursor?: Cursor<TextComponent[] | undefined>;
  field?: FIELD;
  subField?: string;
  transform?: (data: any, character: Character) => any;
}

export default function MultiLineTextDisplay({
  title,
  cursor,
  field: fieldProp,
  subField: subFieldProp,
  transform,
}: MultiLineTextDisplayProps) {
  const field = cursor ? cursor.root() : fieldProp;
  const subField = cursor ? cursor.subpath() : subFieldProp;
  const { character, dispatch } = useCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();

  if (!character || !field) return <></>;

  // Re-derive a typed list cursor from the resolved field/subField (covers both
  // the cursor prop and the legacy string props identically).
  const list = fromStack<TextComponent[]>(field, subField);

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

  const editTextComponent = (index: number) => pushCursor(list.at(index));

  const removeTextComponent = (index: number) => {
    const newValue = structuredClone(textComponents);
    newValue.splice(index, 1);
    dispatch(updateAt(list, newValue));
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
