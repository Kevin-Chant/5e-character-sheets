import { FaTriangleExclamation } from "react-icons/fa6";
import { requestDriveToken } from "src/lib/google-auth";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";

// Reports a peer's edit to a hosted-but-not-open sheet that failed to save.
// Lives in the nav, not the sheet, since the character it's about isn't open.
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
