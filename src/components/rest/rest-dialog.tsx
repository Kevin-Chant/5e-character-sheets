import { useMemo, useState } from "react";
import { replaceCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useSettings } from "src/lib/hooks/use-settings";
import { maxHpValue } from "src/lib/mechanics/resolve";
import {
  applyRestPlan,
  planRest,
  RestFollowUp,
  RestKind,
  RestPlan,
  RestPreset,
} from "src/lib/rest";
import { hasTriggerFor } from "src/lib/play/triggers";
import HitDiceTray from "./hit-dice-tray";
import PrepareSpellsTask from "./prepare-spells-task";
import RestLedger from "./rest-ledger";
import { FaXmark } from "react-icons/fa6";

// Pick short/long from cards showing what each restores, commit as a single
// `replace_character`, then run the interactive parts (hit dice, prepared
// spells) against the rested sheet — required because under slow natural
// healing, dice a long rest hands back are spendable in the same rest.
export default function RestDialog({
  preset,
  onClose,
}: {
  preset?: RestPreset;
  onClose: () => void;
}) {
  const { character, dispatch } = useCharacter();
  const { settings } = useSettings();
  // A called rest opens directly on its workspace, skipping the fork; "Back"
  // still returns to it.
  const [kind, setKind] = useState<RestKind | undefined>(preset?.kind);
  // Defaults to no, so an "at dawn" item is never quietly recharged.
  const [spansDawn, setSpansDawn] = useState(!!preset?.spansDawn);
  // The plan as it stood at commit time; kept rather than re-derived, since
  // after the rest the sheet no longer shows what was missing.
  const [taken, setTaken] = useState<RestPlan>();

  const plans = useMemo(
    () =>
      character
        ? {
            short: planRest(character, "short", settings, { spansDawn }),
            long: planRest(character, "long", settings, { spansDawn }),
          }
        : undefined,
    [character, settings, spansDawn],
  );

  if (!character || !plans) return <></>;

  const plan = taken ?? (kind ? plans[kind] : undefined);
  const committed = !!taken;

  const takeRest = () => {
    if (!kind) return;
    const chosen = plans[kind];
    dispatch(replaceCharacter(applyRestPlan(character, chosen)));
    setTaken(chosen);
  };

  const title = !plan
    ? "Take a rest"
    : committed
      ? `${plan.kind === "long" ? "Long" : "Short"} rest taken`
      : `${plan.kind === "long" ? "Long" : "Short"} rest`;

  return (
    <div className="modal-container">
      <div className="modal-background" onClick={onClose} />
      <div className="modal-content rest-modal">
        <div className="rest-header">
          <h1 className="rest-title">{title}</h1>
          <div className="rest-header-right">
            {plan && <span className="rest-duration">{plan.duration}</span>}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <FaXmark />
            </button>
          </div>
        </div>

        <div className="rest-body">
          {!plan ? (
            <>
              <RestFork
                character={{
                  currHp: character.currHp,
                  maxHp: maxHpValue(character),
                }}
                plans={plans}
                onPick={setKind}
              />
              {hasTriggerFor(character, "dawn") && (
                <label className="settings-checkbox rest-spans-dawn">
                  <input
                    type="checkbox"
                    checked={spansDawn}
                    onChange={(e) => setSpansDawn(e.target.checked)}
                  />
                  This rest spans dawn — recharge &ldquo;at dawn&rdquo;
                  abilities and items with it
                </label>
              )}
            </>
          ) : (
            <RestWorkspace plan={plan} committed={committed} />
          )}
        </div>

        <div className="rest-footer">
          {!plan ? (
            <button className="btn-secondary" onClick={onClose} type="button">
              Cancel
            </button>
          ) : committed ? (
            <button className="btn-primary" onClick={onClose} type="button">
              Done
            </button>
          ) : (
            <>
              <button
                className="btn-secondary"
                onClick={() => setKind(undefined)}
                type="button"
              >
                Back
              </button>
              <button className="btn-primary" onClick={takeRest} type="button">
                Take rest
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// The ledger normally leads; when a rest restores nothing automatically, the
// actionable tasks go first and the ledger's caveats follow.
function RestWorkspace({
  plan,
  committed,
}: {
  plan: RestPlan;
  committed: boolean;
}) {
  const spendDice =
    committed && plan.followUps.some((f) => f.kind === "spendHitDice");
  const ledger = (
    <RestLedger
      plan={plan}
      committed={committed}
      omit={spendDice ? ["hp"] : []}
    />
  );
  const tasks = committed ? (
    <RestTasks plan={plan} />
  ) : (
    <UpcomingTasks plan={plan} />
  );

  return plan.changes.length === 0 ? (
    <>
      {tasks}
      {ledger}
    </>
  ) : (
    <>
      {ledger}
      {tasks}
    </>
  );
}

// What a card advertises: automatic restores, plus spending hit dice when on offer.
const forkLines = (plan: RestPlan): string[] => {
  const lines = plan.changes.map((change) => change.label);
  if (plan.followUps.some((f) => f.kind === "spendHitDice"))
    lines.push("Spend hit dice to heal");
  return lines;
};

// Each card shows its rest's headline effects; a rest that does nothing is
// still offered.
function RestFork({
  character,
  plans,
  onPick,
}: {
  character: { currHp: number; maxHp: number };
  plans: Record<RestKind, RestPlan>;
  onPick: (kind: RestKind) => void;
}) {
  return (
    <>
      <div className="rest-fork">
        {(["short", "long"] as RestKind[]).map((kind) => {
          const plan = plans[kind];
          const lines = forkLines(plan);
          const headline = lines.slice(0, 4);
          const extra = lines.length - headline.length;
          return (
            <button
              key={kind}
              type="button"
              className="rest-fork-card"
              onClick={() => onPick(kind)}
            >
              <span className="rest-fork-kind">
                {kind === "short" ? "Short rest" : "Long rest"}
              </span>
              <span className="rest-fork-duration">{plan.duration}</span>
              <span className="rest-fork-rule" aria-hidden="true" />
              {headline.length === 0 ? (
                <span className="rest-fork-empty">Nothing to restore</span>
              ) : (
                <ul className="rest-fork-list">
                  {headline.map((line) => (
                    <li key={line}>
                      <span className="rest-ledger-marker" aria-hidden="true">
                        ◆
                      </span>
                      {line}
                    </li>
                  ))}
                  {extra > 0 && (
                    <li className="rest-fork-more">+{extra} more</li>
                  )}
                </ul>
              )}
            </button>
          );
        })}
      </div>
      <p className="rest-hint text-muted">
        {character.currHp < character.maxHp
          ? `You're at ${character.currHp} of ${character.maxHp} hit points.`
          : "You're at full hit points."}
      </p>
    </>
  );
}

// Named but not actionable yet: the tasks work on the rested sheet, after commit.
function UpcomingTasks({ plan }: { plan: RestPlan }) {
  const notes = plan.followUps.map(describeFollowUp).filter(Boolean);
  if (notes.length === 0) return <></>;
  return (
    <section className="rest-upcoming">
      <h3 className="rest-section-title">During the rest</h3>
      <ul className="rest-upcoming-list">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

const describeFollowUp = (followUp: RestFollowUp): string => {
  switch (followUp.kind) {
    case "spendHitDice":
      return `Spend hit dice to heal — ${followUp.diceRemaining} available.`;
    case "prepareSpells":
      return `Review ${followUp.className}'s prepared spells.`;
    case "manualRecharge":
      return `Recharge by hand: ${followUp.abilities
        .map((a) => `${a.title} (${a.when})`)
        .join(", ")}.`;
  }
};

// The interactive half of a rest, on the rested sheet.
function RestTasks({ plan }: { plan: RestPlan }) {
  const prepare = plan.followUps.filter(
    (f): f is Extract<RestFollowUp, { kind: "prepareSpells" }> =>
      f.kind === "prepareSpells",
  );
  const manual = plan.followUps.find((f) => f.kind === "manualRecharge");
  const spendDice = plan.followUps.some((f) => f.kind === "spendHitDice");

  return (
    <>
      {spendDice && <HitDiceTray />}
      {prepare.length > 0 && (
        <section className="rest-tasks">
          <h3 className="rest-section-title">Prepared spells</h3>
          {prepare.map((task) => (
            <PrepareSpellsTask
              key={task.classId}
              classId={task.classId}
              className={task.className}
            />
          ))}
        </section>
      )}
      {manual?.kind === "manualRecharge" && (
        <section className="rest-manual">
          <h3 className="rest-section-title">Recharge by hand</h3>
          <p className="text-muted">
            These refresh on something other than a rest, so the sheet left them
            alone:{" "}
            {manual.abilities.map((a) => `${a.title} (${a.when})`).join(", ")}.
          </p>
        </section>
      )}
    </>
  );
}
