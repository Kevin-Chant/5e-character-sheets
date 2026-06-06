import { useReducer, useState } from "react";
import { FaShareNodes } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

// Controls for promoting a Google Drive character into a first-class, shareable
// document and granting other people access to it by email. Only rendered when
// the active datastore supports promotion (currently Google Drive).
export default function DriveShareControls() {
  const { datastore } = useDatastoreSelector();
  const { character } = useCharacter();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  // Promotion mutates datastore-internal state; bump to re-read isShared.
  const [, refresh] = useReducer((x) => x + 1, 0);

  if (!character || !datastore?.promoteCharacter) return <></>;

  const shared = datastore.isShared?.(character.uuid) ?? false;

  const handlePromote = async () => {
    setBusy(true);
    setStatus("");
    try {
      await datastore.promoteCharacter?.(character.uuid);
      refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    setStatus("");
    try {
      await datastore.shareCharacter?.(character.uuid, email);
      setStatus(`Shared with ${email}`);
      setEmail("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drive-share-controls margin-medium">
      {!shared ? (
        <button onClick={handlePromote} disabled={busy}>
          <FaShareNodes /> Make shareable
        </button>
      ) : (
        <form className="row" onSubmit={handleShare}>
          <input
            type="email"
            placeholder="Friend's email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={busy || !email}>
            Share
          </button>
        </form>
      )}
      {status && <p className="margin-small">{status}</p>}
    </div>
  );
}
