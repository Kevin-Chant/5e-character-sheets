import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RemoteDatastore from "src/datastores/remote-datastore";
import { loadFullCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { joinSharingSession } from "src/lib/sharing";
import { isUuid } from "src/lib/types";

export default function RemoteConnectionInitializer() {
  const [uuidInputValue, setUuidInputValue] = useState("");
  const { dispatch } = useCharacter();
  const navigate = useNavigate();

  const updateUuidInputValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUuidInputValue(e.target.value);
  };

  const attemptConnect = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!isUuid(uuidInputValue)) {
      window.alert("Invalid connection code!");
      return;
    }
    const character = await joinSharingSession(uuidInputValue, dispatch);
    if (!character) {
      window.alert("Failed to join session!");
      return;
    }
    dispatch(loadFullCharacter(character));
    navigate("/sheet");
  };

  return (
    <div className="column flex-start">
      <label className="margin-small" htmlFor="uuidInputField">
        Enter your friend's sharing code
      </label>
      <input
        id="uuidInputField"
        className="margin-small"
        type="text"
        value={uuidInputValue}
        onChange={updateUuidInputValue}
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
