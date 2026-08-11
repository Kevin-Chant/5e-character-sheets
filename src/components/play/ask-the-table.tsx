import { useState } from "react";
import classNames from "classnames";
import { FaChevronDown, FaChevronUp } from "react-icons/fa6";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { RestCallForm, RollCallForm } from "./table-calls";

// The three things a DM asks the whole table for. They were three controls in
// two places — initiative in the rail, the roll and the rest as strips of
// their own — which is one act wearing three shapes. Folded away by default:
// asking is a per-scene move, not a per-round one.
export default function AskTheTable() {
  const { sessionStatus, present, callForInitiative, inCombat } =
    useEncounter();
  const { callForRoll, callForRest } = useTableTalk();
  const [open, setOpen] = useState(false);
  if (sessionStatus !== "connected") return null;

  return (
    <div className={classNames("dm-asks", { open })}>
      <button
        type="button"
        className="dm-asks-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Ask the table {open ? <FaChevronUp /> : <FaChevronDown />}
      </button>
      {open && (
        <div className="dm-asks-panel">
          {!inCombat && (
            <div className="dm-ask-row">
              <span className="text-muted">Roll initiative</span>
              <button type="button" onClick={callForInitiative}>
                Ask everyone
              </button>
            </div>
          )}
          <RollCallForm present={present} callForRoll={callForRoll} />
          <RestCallForm callForRest={callForRest} />
        </div>
      )}
    </div>
  );
}
