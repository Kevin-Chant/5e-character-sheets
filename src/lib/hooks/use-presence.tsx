import { useCharacter } from "./use-character";
import { Participant, useSharingSessions } from "./use-sharing-session";

// The dot-path peers broadcast when they open a field's editor mirrors the
// targeted-field path: the field, plus an optional sub-path.
export function fieldPath(field: string, subField?: string): string {
  return subField ? `${field}.${subField}` : field;
}

// Returns the peer (if any) currently editing the given field in the open
// character's live session, so the field can wear their highlight color.
export function useRemoteFieldHighlight(
  field: string,
  subField?: string,
): Participant | undefined {
  const { character } = useCharacter();
  const { getFieldEditor } = useSharingSessions();
  if (!character) return undefined;
  return getFieldEditor(character.uuid, fieldPath(field, subField));
}

// Props that paint a field with a peer's highlight color (and name on hover).
// Returns nothing to spread when no peer is on the field.
export function highlightProps(editor: Participant | undefined) {
  if (!editor) return {};
  return {
    style: {
      outline: `2px solid ${editor.color}`,
      outlineOffset: "2px",
      borderRadius: "4px",
    },
    title: `${editor.name} is editing this`,
  };
}
