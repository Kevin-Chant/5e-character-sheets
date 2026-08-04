import { UUID } from "crypto";
import { FaShareNodes, FaUsers } from "react-icons/fa6";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

// Whose Drive document a listed character actually is.
//
// The two are not interchangeable and the list gave no hint which was which: a
// sheet shared *with* you lives in the owner's file, so deleting it here only
// forgets it, the owner can revoke it out from under you, and a live session on
// it makes you the joiner rather than the host. The datastore already knows —
// `getShareRole` is what decides auto-host vs auto-join — so this is only
// surfacing an answer the app was keeping to itself.
//
// Backends without sharing (localStorage) return nothing and render nothing.
export default function ShareRoleBadge({
  uuid,
  className,
}: {
  uuid: UUID;
  className?: string;
}) {
  const { datastore } = useDatastoreSelector();
  const role = datastore?.getShareRole?.(uuid);

  if (role === "recipient")
    return (
      <FaUsers
        className={className}
        title="Shared with you — this sheet lives in someone else's Drive"
      />
    );
  if (role === "owner")
    return (
      <FaShareNodes
        className={className}
        title="A shareable document in your Drive"
      />
    );
  return <></>;
}
