import classNames from "classnames";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { isDmCreature } from "src/lib/play/encounter";
import { SharedVitals } from "./initiative-rail";

// The opposition, as a standing row of chips — the answer to "who can I
// actually aim at", which used to live only inside the roll dialog's select.
// Players told "you can target the NPCs" had nowhere to look: the initiative
// rail lists everyone in turn order, which is a different question.
//
// Clicking a chip marks it as your current target (the same remembered choice
// an attack re-uses), so "I'm on the ogre" is one tap here and every attack
// dialog opens aimed at it. Advisory like everything on this surface: the
// dialog can still pick anyone, this is just the shortlist.
export default function TargetStrip() {
  const { encounter, self, sharing, hideDeathSaves } = useEncounter();
  const { reportsEnabled, lastTargetId, rememberTarget } = useTableTalk();
  // The DM's creatures only — the party is never "targets" at a glance, and
  // healing picks its own list in the dialog. Hidden rows stay hidden.
  const foes = encounter.participants.filter(
    (p) => !p.hidden && p.id !== self?.id && isDmCreature(p),
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
