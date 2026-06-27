import { useEffect } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { fieldPath } from "src/lib/hooks/use-presence";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";

// Streams this tab's current field selection to the live session, so peers can
// see (and avoid colliding with) what we're editing. Renders nothing.
export default function PresenceBroadcaster() {
  const { character } = useCharacter();
  const { targetedField, subField } = useTargetedField();
  const { broadcastSelection, getRole } = useSharingSessions();
  const uuid = character?.uuid;
  const inSession = uuid ? !!getRole(uuid) : false;

  useEffect(() => {
    if (!uuid || !inSession) return;
    broadcastSelection(
      uuid,
      targetedField ? fieldPath(targetedField, subField) : null,
    );
  }, [uuid, inSession, targetedField, subField, broadcastSelection]);

  return null;
}
