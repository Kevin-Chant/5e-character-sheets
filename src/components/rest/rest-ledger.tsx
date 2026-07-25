import classNames from "classnames";
import { RestChange, RestPlan } from "src/lib/rest";

// The reckoning of a rest: what comes back on the left, what stays spent on the
// right. Deliberately the same component before and after the rest is taken —
// a forecast becomes a receipt, with the markers switching from "will" to
// "did" — so nothing about a rest happens off-screen.
//
// Restored vs. withheld is carried by marker and ink weight, NOT by hue: this
// sheet reserves colour for meaning (crimson = life, amethyst = magic), and a
// third semantic colour here would blur a map that already works.
export default function RestLedger({
  plan,
  committed,
  // Entry keys to leave out. The hit dice tray takes over the HP story once it's
  // on screen, and a ledger line still reading "21/56 — spend hit dice to heal"
  // beside a tray that has already healed you to 33 is just a stale duplicate.
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
          // Not "Restored": most entries are restorations, but expiring
          // temporary hit points is a rest effect too, and filing that under
          // "restored" would be wrong. "What changes" covers both honestly, and
          // the ✓ after the fact carries the affirmative.
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
