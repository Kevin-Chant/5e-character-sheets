import { UUID } from "crypto";
import { FaShareNodes, FaUsers } from "react-icons/fa6";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

// Shows whether a listed character is a Drive doc you own or one shared with
// you (owner vs. recipient behave differently for delete/session role).
// Backends without sharing (localStorage) render nothing.
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
