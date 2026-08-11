import { useCallback, useEffect, useReducer, useState } from "react";
import {
  FaArrowUpRightFromSquare,
  FaLink,
  FaShareNodes,
  FaXmark,
} from "react-icons/fa6";
import Spinner from "src/components/spinner";
import { copyToClipboard } from "src/lib/browser";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { ShareGrant } from "src/lib/types";

// Promotes a Drive character into a shareable document and grants access by
// email. Only rendered when the active datastore supports promotion.
export default function DriveShareControls() {
  const { datastore } = useDatastoreSelector();
  const { character } = useCharacter();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  // Bump to re-read isShared after promotion mutates datastore state.
  const [, refresh] = useReducer((x) => x + 1, 0);
  const [grants, setGrants] = useState<ShareGrant[]>();

  const uuid = character?.uuid;
  const isSharedDocument = uuid
    ? (datastore?.isShared?.(uuid) ?? false)
    : false;

  // Refetched after every grant/revoke so the list stays accurate.
  const loadGrants = useCallback(async () => {
    if (!uuid || !datastore?.listShares || !isSharedDocument) return;
    try {
      setGrants(await datastore.listShares(uuid));
    } catch (err) {
      console.error("Could not list who this character is shared with", err);
      setGrants([]);
    }
  }, [uuid, datastore, isSharedDocument]);

  useEffect(() => {
    void loadGrants();
  }, [loadGrants]);

  if (!character || !uuid || !datastore?.promoteCharacter) return <></>;

  const shared = isSharedDocument;

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

  const importLink = datastore.getImportLink?.(character.uuid);

  // Drive's notification email carries this link too; copyable since mail is
  // easy to lose. Opens the add-sheet flow for someone already granted access.
  const copyImportLink = () => {
    if (!importLink) return;
    copyToClipboard(importLink);
    setStatus("Link copied — send it to someone you've already shared with.");
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
      await loadGrants();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (grant: ShareGrant) => {
    const who = grant.email || grant.name || "this person";
    if (
      !window.confirm(
        `Remove ${who}'s access to ${character.name || "this character"}? ` +
          `They keep any copy they've already exported, but the shared sheet ` +
          `disappears from their list.`,
      )
    )
      return;
    setBusy(true);
    setStatus("");
    try {
      await datastore.revokeShare?.(character.uuid, grant.id);
      setStatus(`Removed ${who}'s access`);
      await loadGrants();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const documentLink = datastore.getDocumentLink?.(character.uuid);
  // Exclude the owner's own (always-present, non-removable) grant.
  const others = (grants ?? []).filter((grant) => !grant.isOwner);

  return (
    <section className="share-section drive-share-controls">
      <h2>Google Drive</h2>
      <p className="text-muted">
        {!shared
          ? "Promote this character to a shareable Drive document, then grant friends access by email."
          : "Grant a friend access to this character by their Google account email."}
      </p>
      {!shared ? (
        <button onClick={handlePromote} disabled={busy}>
          {busy ? (
            <>
              Making shareable <Spinner />
            </>
          ) : (
            <>
              <FaShareNodes /> Make shareable
            </>
          )}
        </button>
      ) : (
        <>
          <form className="row" onSubmit={handleShare}>
            <input
              type="email"
              placeholder="Friend's email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={busy || !email}>
              {busy ? (
                <>
                  Sharing <Spinner />
                </>
              ) : (
                "Share with this email"
              )}
            </button>
          </form>
          {importLink && (
            <button className="link-button" onClick={copyImportLink}>
              <FaLink /> Copy the link for people you&apos;ve shared with
            </button>
          )}

          <h3 className="share-access-title">Who has access</h3>
          {grants === undefined ? (
            <p className="text-muted">
              Checking <Spinner />
            </p>
          ) : others.length === 0 ? (
            <p className="text-muted">
              Only you. Share the character above to add someone.
            </p>
          ) : (
            <ul className="share-access-list">
              {others.map((grant) => (
                <li key={grant.id} className="row space-between">
                  <span>
                    {grant.email || grant.name || "Someone"}
                    <span className="text-muted"> · can {grant.role}</span>
                  </span>
                  <button
                    className="icon-btn btn-danger"
                    onClick={() => void handleRevoke(grant)}
                    disabled={busy}
                    title={`Remove ${grant.email || grant.name || "their"} access`}
                    aria-label={`Remove ${grant.email || grant.name || "their"} access`}
                  >
                    <FaXmark />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {documentLink && (
            <a
              className="link-button"
              href={documentLink}
              target="_blank"
              rel="noreferrer"
            >
              <FaArrowUpRightFromSquare /> Open this character&apos;s file in
              Drive
            </a>
          )}
        </>
      )}
      {status && <p className="margin-small">{status}</p>}
    </section>
  );
}
