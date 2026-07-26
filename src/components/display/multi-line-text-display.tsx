import classNames from "classnames";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
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
import { FaPencil, FaXmark } from "react-icons/fa6";
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
  // Flow the entries into as many columns as the panel can hold, instead of one
  // long single-file list. Only for sections whose entries are short *names*
  // (Features & Traits — 18 of them, one line each). Personality entries are
  // prose sentences, and setting those in a ~9rem measure would make them
  // harder to read, not easier. Play mode only: in edit mode each row also
  // carries edit/remove controls, which need the full width.
  flowEntries?: boolean;
}

export default function MultiLineTextDisplay({
  title,
  cursor,
  field: fieldProp,
  subField: subFieldProp,
  transform,
  flowEntries,
}: MultiLineTextDisplayProps) {
  const field = cursor ? cursor.root() : fieldProp;
  const subField = cursor ? cursor.subpath() : subFieldProp;
  const { character, dispatch } = useLoadedCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();

  if (!field) return <></>;

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

  // An empty section is scaffolding, and the paper sheet only prints it because
  // it can't know whether you'll write there. In play mode it can't even be
  // filled, so it isn't shown; in edit mode it collapses to a slim labelled
  // strip, which keeps the landmark (and the order around it) while giving back
  // the height an empty frame was taking.
  const empty = renderedTextComponents.length === 0;
  if (empty && !editMode) return <></>;

  return (
    <div
      className={classNames("column rounded-border-box multi-line-text", {
        "section-empty": empty,
      })}
    >
      <div
        className={classNames("multi-line-entries", {
          flow: flowEntries && !editMode,
        })}
      >
        {renderedTextComponents.map((textComponent, i) => {
          const titleComponent = isTextComponentWithDetail(textComponent) ? (
            <ComponentWithPopover
              componentClass="detail-hint"
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
            <div key={i} className="row space-between text-line-row">
              {titleComponent}
              {editMode && (
                <div className="flex text-line-controls">
                  <button
                    className="row-edit"
                    aria-label="Edit"
                    onClick={(e) => {
                      e.preventDefault();
                      editTextComponent(i);
                    }}
                  >
                    <FaPencil />
                  </button>
                  <button
                    className="row-remove"
                    aria-label="Remove"
                    onClick={(e) => {
                      e.preventDefault();
                      removeTextComponent(i);
                    }}
                  >
                    <FaXmark />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <b className="section-heading pos-relative margin-large">
        {title}
        {editMode && (
          <button
            className="section-add"
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
