import { FaTriangleExclamation } from "react-icons/fa6";
import { requestDriveToken } from "src/lib/google-auth";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";

// Says out loud that a peer's edit to a sheet you are *hosting but not looking
// at* couldn't be written.
//
// The open sheet has had a save indicator for a long time, including the one
// that knows an expired Google session is fixed by a click rather than by
// waiting. The background fold — a session whose character isn't on screen —
// had a `console.error`, which is the worst place for this particular failure:
// nobody is looking at that sheet by definition, the peer who made the edit was
// told it landed, and the host goes on serving the stale copy to the next
// joiner as though it were current. The edits themselves are held by the
// sharing provider, so "Try again" is a real second chance and not a way to
// dismiss the message.
//
// Lives in the nav rather than in the sheet, because the character it is about
// is the one you don't have open.
export default function BackgroundSaveWarning() {
  const { backgroundSaveErrors, retryBackgroundSaves } = useSharingSessions();
  const { characters } = useDatastore();

  if (backgroundSaveErrors.length === 0) return null;

  const names = backgroundSaveErrors.map(({ uuid }) => {
    const match = characters.find((entry) => entry.uuid === uuid);
    return match?.name || "a shared character";
  });
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.length} shared characters`;
  const needsAuth = backgroundSaveErrors.some(({ kind }) => kind === "auth");

  // The same reasoning as the nav's save indicator: consent has to be requested
  // from the gesture itself, and the retry is what actually clears this.
  const retry = () => {
    if (!needsAuth) {
      retryBackgroundSaves();
      return;
    }
    void requestDriveToken().then((ok) => {
      if (ok) retryBackgroundSaves();
    });
  };

  return (
    <div className="share-presence-banner" role="alert">
      <FaTriangleExclamation aria-hidden />
      <span>
        {needsAuth
          ? `Google Drive needs you to sign in again before changes your co-editors made to ${who} can be saved.`
          : `Couldn't save changes your co-editors made to ${who}. They're kept in this tab for now.`}
      </span>
      <button onClick={retry}>
        {needsAuth ? "Sign in and retry" : "Try again"}
      </button>
    </div>
  );
}
