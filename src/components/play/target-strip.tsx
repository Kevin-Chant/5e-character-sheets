import classNames from "classnames";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { isFoe } from "src/lib/play/encounter";
import { SharedVitals } from "./initiative-rail";

// Standing row of foe chips to pick a current target; clicking one aims every
// subsequent attack dialog at it (still advisory — the dialog can target anyone).
export default function TargetStrip() {
  const { encounter, self, sharing, hideDeathSaves } = useEncounter();
  const { reportsEnabled, lastTargetId, rememberTarget } = useTableTalk();
  const foes = encounter.participants.filter(
    (p) => !p.hidden && p.id !== self?.id && isFoe(p),
  );
  if (!reportsEnabled || foes.length === 0) return null;
  return (
    <div className="target-strip">
      <span className="target-strip-label">Targets</span>
      <div className="target-strip-row">
        {foes.map((p) => {
          const targeted = p.id === lastTargetId;
          return (
            <button
              key={p.id}
              type="button"
              className={classNames("target-chip", { targeted })}
              aria-pressed={targeted}
              title={
                targeted
                  ? `${p.name} is your target — attacks open aimed at it`
                  : `Make ${p.name} your target`
              }
              onClick={() => rememberTarget(targeted ? undefined : p.id)}
            >
              <span className="target-chip-name">{p.name}</span>
              <SharedVitals
                participant={p}
                selfId={self?.id}
                sharing={sharing}
                showDeathSaves={!hideDeathSaves}
              />
              {p.conditions.length > 0 && (
                <span
                  className="target-chip-conditions"
                  title={p.conditions
                    .map((c) =>
                      c.rounds === undefined
                        ? c.name
                        : `${c.name} (${c.rounds})`,
                    )
                    .join(", ")}
                >
                  {p.conditions.map((c) => c.name).join(", ")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
