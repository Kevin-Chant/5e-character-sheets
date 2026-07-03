import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useRemoteSharingSession } from "src/lib/hooks/use-sharing-session";
import { hydrateCharacter } from "src/lib/migrations/hydrate-character";
import { writeLastDatastore } from "src/lib/last-datastore";
import { isUuid } from "src/lib/types";
import IdentityFields from "src/components/identity-fields";

export default function RemoteConnectionInitializer() {
  const [uuidInputValue, setUuidInputValue] = useState("");
  const { dispatch } = useCharacter();
  const navigate = useNavigate();
  const { joinSession, getCharacter } = useRemoteSharingSession(dispatch);

  const updateUuidInputValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUuidInputValue(e.target.value);
  };

  const attemptConnect = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!isUuid(uuidInputValue)) {
      window.alert("Invalid connection code!");
      return;
    }

    await joinSession(uuidInputValue);
    const character = await getCharacter();
    if (!character) {
      window.alert("Failed to join session!");
      return;
    }
    // The host may run an older client; migrate their payload locally. We never
    // write the upgrade back — the host owns the persisted copy.
    const result = hydrateCharacter(character);
    if (!result.ok) {
      console.error("Joined character failed validation", result.errors);
      window.alert("The shared character couldn't be loaded.");
      return;
    }
    dispatch(loadPersistedCharacter(result.character));
    writeLastDatastore("remote");
    navigate("/sheet");
  };

  return (
    <div className="column flex-start">
      <label className="margin-small" htmlFor="uuidInputField">
        Enter your friend&apos;s sharing code
      </label>
      <input
        id="uuidInputField"
        className="margin-small"
        type="text"
        value={uuidInputValue}
        onChange={updateUuidInputValue}
      />
      <IdentityFields
        uuid={isUuid(uuidInputValue) ? uuidInputValue : undefined}
      />
      <button
        className="margin-small"
        disabled={!uuidInputValue}
        onClick={attemptConnect}
      >
        Connect
      </button>
    </div>
  );
}
