import classNames from "classnames";
import { RestChange, RestPlan } from "src/lib/rest";

// What comes back vs. what stays spent. Used both as a pre-rest forecast and
// a post-rest receipt (markers switch "will"/"did").
//
// Restored vs. withheld is carried by marker and ink weight, not hue — this
// sheet reserves colour for meaning (crimson = life, amethyst = magic).
export default function RestLedger({
  plan,
  committed,
  // Entry keys to leave out — the hit dice tray takes over the HP story once
  // it's on screen.
  omit = [],
}: {
  plan: RestPlan;
  committed: boolean;
  omit?: string[];
}) {
  const changes = plan.changes.filter((c) => !omit.includes(c.key));
  const unchanged = plan.unchanged.filter((c) => !omit.includes(c.key));
  const nothingToDo = changes.length === 0 && unchanged.length === 0;

  if (nothingToDo)
    return (
      <p className="rest-ledger-empty text-muted">
        Nothing on this sheet needs restoring.
      </p>
    );

  return (
    <div className="rest-ledger">
      {changes.length > 0 && (
        <Column
          // Not "Restored": expiring temp HP is a rest effect too, not a restoration.
          title={committed ? "What changed" : "What changes"}
          entries={changes}
          marker={committed ? "✓" : "◆"}
        />
      )}
      {unchanged.length > 0 && (
        <Column title="Stays spent" entries={unchanged} marker="◇" muted />
      )}
    </div>
  );
}

function Column({
  title,
  entries,
  marker,
  muted,
}: {
  title: string;
  entries: RestChange[];
  marker: string;
  muted?: boolean;
}) {
  return (
    <div className={classNames("rest-ledger-column", { "is-withheld": muted })}>
      <h4 className="rest-ledger-title">{title}</h4>
      <dl className="rest-ledger-entries">
        {entries.map((entry) => (
          <div className="rest-ledger-entry" key={entry.key}>
            <span className="rest-ledger-marker" aria-hidden="true">
              {marker}
            </span>
            <dt>{entry.label}</dt>
            <dd>{entry.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
