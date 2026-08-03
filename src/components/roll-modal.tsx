import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import {
  formatCustomFormula,
  formatCustomFormulaWithDamage,
  formatSaveEffect,
} from "src/lib/formula";
import { useCharacter } from "src/lib/hooks/use-character";
import { useRoller } from "src/lib/hooks/use-roller";
import { useRollMode } from "src/lib/hooks/use-roll-mode";
import { useSettings } from "src/lib/hooks/use-settings";
import {
  CheckMode,
  CritMode,
  CritSpec,
  critDiceCount,
  formatRollBreakdown,
  rollD20Check,
  rollFormula,
} from "src/lib/roll";
import {
  availableSlotLevels,
  damageMapFor,
  damageOnSave,
  DamageResolution,
  ExtraDamageEntry,
  extrasForAttack,
  resolveDamage,
  slotDiceCount,
  spellExtrasForCast,
  spellSaveEffect,
  usesPoolState,
} from "src/lib/attack-roll";
import { spellHealingAtLevel } from "src/lib/spells/spell-scaling";
import {
  describeDeathSave,
  remainingHitDice,
  resolveDeathSave,
} from "src/lib/rules";
import { hitDieFormula } from "src/lib/rest";
import {
  advantageNotes,
  applyTotalRiders,
  critThreshold,
  flatBonusRiders,
  hitDieHealing,
  riderFlatBonus,
  ridersFor,
} from "src/lib/mechanics/riders";
import { maxHpValue, resolveEffects } from "src/lib/mechanics/resolve";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { conditionRollNotes } from "src/lib/play/conditions";
import { OutgoingRoll, ReportedDamage, RollStage } from "src/lib/play/reports";
import { calculateCustomFormula } from "src/lib/formula";
import { RollRequest } from "src/lib/hooks/use-roller";
import { isFoe, Participant } from "src/lib/play/encounter";
import {
  conditionRiders,
  conditionSummary,
} from "src/lib/play/condition-mechanics";
import { spellConditionFor } from "src/lib/spells/spell-conditions";
import {
  AttackContext,
  applicableRiders,
  attackContext,
} from "src/lib/mechanics/conditions";
import { LeveledSpellLevel, StandardDie } from "src/lib/data/data-definitions";
import {
  Character,
  CustomFormula,
  CustomFormulaWithDamage,
  DieDefinition,
  SaveEffect,
  Spell,
} from "src/lib/types";
import { FaXmark } from "react-icons/fa6";
import { charPath, updateAt } from "src/lib/cursor";
import { FIELD } from "src/lib/data/data-definitions";

const dieLabel = (die: DieDefinition) =>
  typeof die === "string" ? die : `d${die.numFaces}`;

const totalLevel = (levels: { level: number }[]) =>
  levels.reduce((sum, c) => sum + (c.level || 0), 0);

const ordinalSlot = (n: number) =>
  `${n}${["th", "st", "nd", "rd"][n % 10 > 3 || (n >= 11 && n <= 13) ? 0 : n % 10]}`;

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// The " — 4 + 3 + 2" suffix on a result line, or nothing when the total needs
// no explaining.
const breakdown = (total: number, dice: number[], crit?: CritSpec) => {
  const parts = formatRollBreakdown(total, dice, crit);
  return parts ? ` — ${parts}` : "";
};

// "We know nothing about the weapon" — a stable identity so the memoized rider
// lists in the controls don't churn on every render.
const NO_CONTEXT: AttackContext = {};

// Short in-dialog wording for each crit flavor, so the player can see which
// house rule is in force without opening Settings.
const CRIT_MODE_LABELS: Record<CritMode, string> = {
  raw: "double the damage dice",
  maxDice: "maximize the dice, then roll again",
  total: "double the total, modifiers included",
};

// The roll dialog. Read-only: it reuses the modal CSS but not ModalContainer (no
// draft reducer / targeted-field coupling). An "attack" surfaces a to-hit roll
// and its damage together, so one button handles both steps of an attack.
export default function RollModal() {
  const { character } = useCharacter();
  const { request, closeRoller } = useRoller();
  if (!request || !character) return <></>;
  // Keyed on the opening, not the shape: two attacks in a row land on the same
  // component instances, and without this the second one opens showing the
  // first one's result.
  return (
    <Shell key={request.id} label={request.label} close={closeRoller}>
      <RollBody request={request} character={character} />
    </Shell>
  );
}

function RollBody({
  request,
  character,
}: {
  request: RollRequest;
  character: Character;
}) {
  const spec = request.spec;
  // Shared between the two halves of an attack: the to-hit roll sets it when the
  // kept d20 lands in the crit range, and the damage half inflates its dice.
  // Kept manually overridable — the sheet can't see the many other ways a hit
  // crits (a paralyzed target, an assassin's surprise round). `extraSets` is the
  // exploding-crits count carried over from the to-hit roll.
  const [critical, setCritical] = useState(false);
  const [extraSets, setExtraSets] = useState(0);
  // The weapon properties the rider conditions read. Derived once for both
  // halves of an attack, so the to-hit and damage sections agree about which
  // riders are in play.
  const context = useMemo(
    () =>
      spec.kind === "attack" && spec.attack
        ? attackContext(spec.attack)
        : NO_CONTEXT,
    [spec],
  );

  const isHealing = spec.kind === "attack" && !!spec.spell?.mechanics?.healing;
  // One `SaveEffect` whichever way it was authored: a weapon or ability
  // carries its own `save`, a spell carries `resolution: {kind: "save"}` in
  // the catalog's shape — which this dialog used to ignore entirely, so
  // Fireball showed no DC at all.
  const saveEffect =
    spec.kind === "attack"
      ? (spec.save ?? spellSaveEffect(character, spec.spell))
      : undefined;
  // The condition this cast puts on its targets (Bless, Hideous Laughter) —
  // looked up by title at cast time (see spell-conditions.ts for why it's an
  // overlay, not a mechanics field).
  const conditionGrant =
    spec.kind === "attack" ? spellConditionFor(spec.spell) : undefined;
  // A save-based or condition-granting effect targets a *set* (everyone in
  // the blast, the three allies Bless touches); an attack roll targets
  // exactly one creature.
  const multiTarget =
    spec.kind === "attack" &&
    spec.toHit === undefined &&
    !isHealing &&
    (!!saveEffect || !!conditionGrant);
  const targeting = useTargeting(
    request.id,
    spec.kind === "attack",
    multiTarget,
    // You can aim a heal at yourself — and a save-less condition (Bless is a
    // buff; a save means the target resists, i.e. not you).
    isHealing || (!!conditionGrant && !saveEffect),
  );
  const { targetId, report } = targeting;
  const mechanics = spec.kind === "attack" ? spec.spell?.mechanics : undefined;
  // Whether there are dice on this side of the screen at all. Without any
  // (Hideous Laughter), the act still has to reach the DM — that's the
  // announce path below.
  const hasRollableEffect =
    spec.kind === "attack" &&
    !!(
      spec.damage ||
      mechanics?.damage ||
      mechanics?.damageTable ||
      mechanics?.healing
    );

  // The save a target rolls, as a number the DM can rule with. It never used
  // to leave this dialog — a save-based spell's damage arrived at the seat as
  // a bare total, and the DC had to be said out loud.
  const save = saveEffect
    ? {
        dc: calculateCustomFormula(saveEffect.dc, character),
        ...(saveEffect.stat ? { stat: saveEffect.stat } : {}),
        ...(saveEffect.onSuccess ? { onSuccess: saveEffect.onSuccess } : {}),
      }
    : undefined;
  // Rides every report of this exchange; the table-talk layer turns it into
  // per-target consent prompts, and the DM card into apply buttons.
  const reportedCondition = conditionGrant
    ? {
        condition: {
          name: conditionGrant.name,
          ...(conditionGrant.rounds !== undefined
            ? { rounds: conditionGrant.rounds }
            : {}),
        },
      }
    : {};

  return (
    <>
      {/* Who this is aimed at, asked *before* the dice — which is the whole
          reordering. The old flow rolled first and picked a target last, so
          every stage of an attack reached the DM as one anonymous number
          after the fact, if at all. Picking first means the to-hit and the
          damage both arrive addressed, and the damage roll needs no second
          answer to a question already answered. */}
      {targeting.enabled &&
        (multiTarget ? (
          <TargetMultiPicker
            selfId={targeting.selfId}
            foes={targeting.foes}
            party={targeting.party}
            targetIds={targeting.targetIds}
            toggleTarget={targeting.toggleTarget}
          />
        ) : (
          <TargetPicker
            healing={isHealing}
            selfId={targeting.selfId}
            foes={targeting.foes}
            party={targeting.party}
            targetId={targeting.targetId}
            setTargetId={targeting.setTargetId}
          />
        ))}
      {spec.kind === "check" && (
        <>
          <CheckControls
            character={character}
            modifier={spec.modifier}
            onRolled={(rolled) =>
              report({ stage: "check", label: request.label, ...rolled }, false)
            }
          />
          {/* "Your DM says: that's a success" — the check's counterpart to
              the attack dialog's hit/miss line. */}
          <VerdictLine exchangeId={request.id} />
        </>
      )}
      {spec.kind === "formula" && (
        <FormulaControls character={character} formula={spec.formula} />
      )}
      {spec.kind === "hitDie" && (
        <HitDieControls
          character={character}
          die={spec.die}
          // Untargeted healing: nothing for the DM to apply (the HP write is
          // the player's own and syncs through the projection) — this is the
          // "why" arriving next to it.
          onRolled={(rolled) =>
            report({ stage: "healing", label: request.label, ...rolled }, false)
          }
        />
      )}
      {spec.kind === "deathSave" && (
        <DeathSaveControls
          character={character}
          onRolled={(rolled) => report({ stage: "check", ...rolled }, false)}
        />
      )}
      {spec.kind === "attack" && (
        <>
          {spec.toHit !== undefined && (
            <CheckControls
              character={character}
              label="To Hit"
              modifier={spec.toHit}
              isAttack
              context={context}
              onCrit={(crit, explosions) => {
                setCritical(crit);
                setExtraSets(explosions);
              }}
              onRolled={(rolled) =>
                report(
                  { stage: "toHit", label: request.label, ...rolled },
                  true,
                )
              }
            />
          )}
          {saveEffect && (
            <SaveControls character={character} save={saveEffect} />
          )}
          {/* What the cast leaves on its targets, said before anything rolls
              — the same slot the save DC occupies for the other family. */}
          {conditionGrant && (
            <p className="muted font-small roll-applies">
              Applies <strong>{conditionGrant.name}</strong>
              {conditionSummary(conditionGrant.name)
                ? ` — ${conditionSummary(conditionGrant.name)}`
                : ""}
              {conditionGrant.note ? ` (${conditionGrant.note})` : ""}
            </p>
          )}
          {hasRollableEffect || (!saveEffect && !conditionGrant) ? (
            <EffectControls
              character={character}
              damage={spec.damage}
              spell={spec.spell}
              save={saveEffect}
              context={context}
              titled={spec.toHit !== undefined || saveEffect !== undefined}
              critical={critical}
              extraSets={extraSets}
              onRolled={({ castLevel, ...rolled }) =>
                report(
                  {
                    ...rolled,
                    label: castLevel
                      ? `${request.label} (${ordinalSlot(castLevel)})`
                      : request.label,
                    ...(save ? { save } : {}),
                    ...reportedCondition,
                  },
                  true,
                )
              }
              // Only a to-hit roll can crit — a save-based spell never does, so
              // that variant gets no toggle.
              setCritical={
                spec.toHit !== undefined
                  ? (crit) => {
                      setCritical(crit);
                      // Un-ticking drops any exploding stack with it; ticking by
                      // hand is a plain crit until a roll says otherwise.
                      setExtraSets(0);
                    }
                  : undefined
              }
            />
          ) : (
            // No dice at all — Hideous Laughter, a stunning gaze: the target
            // rolls, this side only declares. The announcement is the whole
            // act, so it gets an explicit button rather than riding a roll.
            <CastAnnounce
              enabled={targeting.enabled}
              targeted={targeting.targeted}
              onAnnounce={() =>
                report(
                  {
                    stage: "cast",
                    label: request.label,
                    total: 0,
                    ...(save ? { save } : {}),
                    ...reportedCondition,
                  },
                  true,
                )
              }
            />
          )}
          {/* The answer that used to be a sentence across the table. Purely
              informational here: the damage button never waited on it, and
              still doesn't. */}
          <VerdictLine exchangeId={request.id} />
          {targeting.enabled && (
            <p className="muted font-small">
              {targetId
                ? "Your DM sees each roll as it lands — re-roll if you need to."
                : "Pick a target and your DM sees these rolls as they land."}
            </p>
          )}
        </>
      )}
    </>
  );
}

// What the dialog needs to report its rolls: the chosen target(s), and a
// `report` that stamps each roll with the exchange and its attempt number.
// `multi` is the save-based shape — the *target* rolls, so a Fireball names
// every creature in the blast where an attack roll names exactly one.
function useTargeting(
  exchangeId: string,
  isAttack: boolean,
  multi: boolean,
  // Healing may aim at yourself — the most common cure there is. Attacks
  // never list you.
  includeSelf: boolean,
) {
  const { encounter, self } = useEncounter();
  const { reportsEnabled, sendReport, lastTargetId, rememberTarget } =
    useTableTalk();
  const selfId = self?.id;
  // No hidden rows: what a player can't see, they can't call a target.
  const targets = useMemo(
    () =>
      encounter.participants.filter(
        (p) => (includeSelf || p.id !== selfId) && !p.hidden,
      ),
    [encounter.participants, selfId, includeSelf],
  );
  // The goblins above the party: the picker groups by side so eight rows of
  // mixed friends and monsters read as a choice rather than a roster dump.
  const foes = useMemo(() => targets.filter(isFoe), [targets]);
  const party = useMemo(() => {
    const rest = targets.filter((t) => !isFoe(t));
    // Yourself first when you're offered at all — a heal's likeliest target.
    return includeSelf && selfId
      ? [
          ...rest.filter((t) => t.id === selfId),
          ...rest.filter((t) => t.id !== selfId),
        ]
      : rest;
  }, [targets, includeSelf, selfId]);
  const enabled = isAttack && reportsEnabled && targets.length > 0;
  // The last thing this player swung at, which in a fight is very often the
  // next thing too. Dropped if it has left the order. Only an attack opens
  // pre-aimed: a plain check or a hit die must not inherit the goblin from
  // your last swing and report itself as aimed at it (which is exactly what
  // happened before this gate).
  const [targetId, setTargetId] = useState(() =>
    isAttack &&
    !multi &&
    lastTargetId &&
    targets.some((t) => t.id === lastTargetId)
      ? lastTargetId
      : "",
  );
  const [targetIds, setTargetIds] = useState<string[]>(() =>
    multi && lastTargetId && targets.some((t) => t.id === lastTargetId)
      ? [lastTargetId]
      : [],
  );
  const targetRef = useRef(targetId);
  targetRef.current = targetId;
  const targetIdsRef = useRef(targetIds);
  targetIdsRef.current = targetIds;
  const targeted = multi ? targetIds.length > 0 : !!targetId;
  // Attempts per stage, counted locally. Rolling three times before naming a
  // target and then naming one must not report "attempt 1" — the point of the
  // number is that a re-roll can't hide behind the moment it was sent.
  const attempts = useRef<Record<string, number>>({});
  const held = useRef<Record<string, OutgoingRoll>>({});

  const report = useCallback(
    (
      roll: Omit<
        OutgoingRoll,
        "exchangeId" | "attempt" | "targetId" | "targetIds"
      > & {
        stage: RollStage;
      },
      needsTarget: boolean,
    ) => {
      const attempt = (attempts.current[roll.stage] ?? 0) + 1;
      attempts.current[roll.stage] = attempt;
      const chosen = multi
        ? targetIdsRef.current.length > 0
        : !!targetRef.current;
      const full: OutgoingRoll = {
        ...roll,
        exchangeId,
        attempt,
        ...(multi
          ? chosen
            ? { targetIds: [...targetIdsRef.current] }
            : {}
          : targetRef.current
            ? { targetId: targetRef.current }
            : {}),
      };
      // Rolled before choosing: hold it rather than drop it, and send it the
      // moment a target is named. Rolling first and picking after is otherwise
      // the way to make a bad roll disappear.
      if (needsTarget && !chosen) {
        held.current[roll.stage] = full;
        return;
      }
      delete held.current[roll.stage];
      sendReport(full);
    },
    [exchangeId, sendReport, multi],
  );

  useEffect(() => {
    if (!targeted) return;
    rememberTarget(multi ? targetIds[targetIds.length - 1] : targetId);
    const flushing = Object.values(held.current);
    held.current = {};
    flushing.forEach((roll) =>
      sendReport(
        multi ? { ...roll, targetIds: [...targetIds] } : { ...roll, targetId },
      ),
    );
  }, [targetId, targetIds]);

  const toggleTarget = useCallback(
    (id: string, on: boolean) =>
      setTargetIds((prev) =>
        on
          ? [...prev.filter((x) => x !== id), id]
          : prev.filter((x) => x !== id),
      ),
    [],
  );

  return {
    enabled,
    multi,
    targeted,
    selfId,
    foes,
    party,
    targetId,
    setTargetId,
    targetIds,
    toggleTarget,
    report,
  };
}

// The two sides in picking order: what you're attacking first, unless you're
// healing — then your own people lead.
function targetGroups(
  healing: boolean,
  foes: Participant[],
  party: Participant[],
): [string, Participant[]][] {
  const groups: [string, Participant[]][] = [
    ["Enemies", foes],
    ["Party", party],
  ];
  if (healing) groups.reverse();
  return groups.filter(([, list]) => list.length > 0);
}

function TargetPicker({
  healing,
  selfId,
  foes,
  party,
  targetId,
  setTargetId,
}: {
  healing: boolean;
  selfId?: string;
  foes: Participant[];
  party: Participant[];
  targetId: string;
  setTargetId: (id: string) => void;
}) {
  return (
    <label className="row roll-target">
      <span>{healing ? "Healing" : "Attacking"}</span>
      <select
        aria-label={healing ? "Who you are healing" : "Who you are attacking"}
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
      >
        <option value="">Choose a target…</option>
        {targetGroups(healing, foes, party).map(([label, list]) => (
          <optgroup key={label} label={label}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === selfId ? `${p.name} (you)` : p.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

// The save-based counterpart: checkboxes, because "Orc 1 and 2 are in the
// blast" is a set, not a pick. Same grouping as the single-target select.
function TargetMultiPicker({
  selfId,
  foes,
  party,
  targetIds,
  toggleTarget,
}: {
  selfId?: string;
  foes: Participant[];
  party: Participant[];
  targetIds: string[];
  toggleTarget: (id: string, on: boolean) => void;
}) {
  return (
    <div className="column roll-target roll-target-multi">
      <span>Targets</span>
      {targetGroups(false, foes, party).map(([label, list]) => (
        <div key={label} className="column roll-target-group">
          <span className="muted font-small">{label}</span>
          {list.map((p) => (
            <label key={p.id} className="row roll-extra-toggle">
              <input
                type="checkbox"
                checked={targetIds.includes(p.id)}
                onChange={(e) => toggleTarget(p.id, e.target.checked)}
              />
              <span>{p.id === selfId ? `${p.name} (you)` : p.name}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// "Your DM says: that hits." Shown once a ruling comes back for this exchange.
function VerdictLine({ exchangeId }: { exchangeId: string }) {
  const { verdicts } = useTableTalk();
  const outcome = verdicts[exchangeId];
  if (!outcome) return null;
  const bad = outcome === "miss" || outcome === "failure";
  const wording: Record<typeof outcome, string> = {
    critical: "critical hit",
    hit: "that hits",
    miss: "that misses",
    success: "that's a success",
    failure: "that's not enough",
  };
  return (
    <p className={classNames("roll-verdict", { hit: !bad, miss: bad })}>
      Your DM says: <strong>{wording[outcome]}</strong>
    </p>
  );
}

// The manual half of every roll surface: real dice were rolled off-screen, and
// this is where the result comes in. One input and a submit, because the player
// is mid-turn with dice in one hand.
function ManualRollInput({
  prompt,
  buttonLabel = "Enter",
  min = 1,
  max,
  onCommit,
}: {
  prompt: string;
  buttonLabel?: string;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  const [raw, setRaw] = useState("");
  const parsed = Number(raw);
  const valid =
    raw.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed >= min &&
    (max === undefined || parsed <= max);
  return (
    <form
      className="row roll-manual"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onCommit(Math.floor(parsed));
        setRaw("");
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        aria-label={prompt}
        placeholder={prompt}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <button type="submit" className="btn-primary" disabled={!valid}>
        {buttonLabel}
      </button>
    </form>
  );
}

// "I cast Hideous Laughter on Goblin 1", as a button. Only rendered when the
// effect has no dice of its own; only sendable once it's aimed at someone,
// because the address *is* the message. Re-announcing is numbered like any
// re-roll, never blocked.
function CastAnnounce({
  enabled,
  targeted,
  onAnnounce,
}: {
  enabled: boolean;
  targeted: boolean;
  onAnnounce: () => void;
}) {
  const [announced, setAnnounced] = useState(0);
  // Solo, or no DM to tell: the save DC above is the whole story.
  if (!enabled) return null;
  return (
    <div className="column roll-section">
      <button
        className="btn-primary roll-go"
        disabled={!targeted}
        onClick={() => {
          onAnnounce();
          setAnnounced((n) => n + 1);
        }}
      >
        {announced ? "Announce again" : "Announce cast"}
      </button>
      {announced > 0 ? (
        <p className="muted font-small">Announced — your DM sees it.</p>
      ) : (
        !targeted && (
          <p className="muted font-small">Pick who it&apos;s aimed at first.</p>
        )
      )}
    </div>
  );
}

// A save-based attack's header: the DC the *target* rolls against. Read-only —
// the target's roll happens on the other side of the table, so there's nothing
// here to roll, only the number to call out and what a success does.
function SaveControls({
  character,
  save,
}: {
  character: Character;
  save: SaveEffect;
}) {
  return (
    <div className="column roll-section">
      <p className="roll-section-title">Saving Throw</p>
      <p className="roll-total font-large roll-save-dc">
        {formatSaveEffect(save, character)}
      </p>
      {save.onSuccess && (
        <p className="roll-part muted">
          {save.onSuccess === "half"
            ? "Half damage on a success"
            : "No damage on a success"}
        </p>
      )}
      {save.note && <p className="muted font-small">{save.note}</p>}
    </div>
  );
}

// The crit callout for the kept d20, or undefined when none applies. Attack
// to-hit rolls always show it (a die at/above the crit threshold — usually a
// nat 20, wider with Improved Critical — is a "Critical Hit", nat 1 a
// "Critical Miss"); other checks only when the global setting is on, with a
// nat 20 = "Critical Success" and a nat 1 = "Critical Fail".
function critLabelFor(
  kept: number,
  isAttack: boolean,
  onAllRolls: boolean,
  threshold: number,
): string | undefined {
  if (!isAttack && !onAllRolls) return undefined;
  if (kept >= (isAttack ? threshold : 20))
    return isAttack ? "Critical Hit" : "Critical Success";
  if (kept === 1) return isAttack ? "Critical Miss" : "Critical Fail";
  return undefined;
}

// A d20 + modifier roll with advantage/disadvantage. Reused as a standalone
// check and as the "To Hit" half of an attack. Riders for the roll kind
// (rerolls, minimum dice, crit range) come from the character's features.
function CheckControls({
  character,
  modifier,
  label,
  isAttack = false,
  context = NO_CONTEXT,
  onCrit,
  onRolled,
}: {
  character: Character;
  modifier: number;
  label?: string;
  isAttack?: boolean;
  // The weapon being attacked with, as the rider conditions see it. Empty for a
  // plain check (and for a spell attack), which leaves every weapon condition
  // undecided — the pre-tags behaviour.
  context?: AttackContext;
  // Reports whether this roll was a critical hit (and how many exploding-crit
  // repeats followed), so the damage half can inflate its dice. Re-rolling
  // reports the new verdict (including "not a crit").
  onCrit?: (crit: boolean, explosions: number) => void;
  // Every d20 that lands here, on its way to the table. Called for re-rolls
  // too — that's the point of it.
  onRolled?: (
    rolled: Pick<
      OutgoingRoll,
      "total" | "faces" | "kept" | "mode" | "critical" | "fumble" | "manual"
    >,
  ) => void;
}) {
  const {
    settings: { criticalsOnAllRolls, explodingCriticals },
  } = useSettings();
  const { rollMode } = useRollMode();
  const manual = rollMode === "manual";
  const { selfConditions: conditions } = useEncounter();
  // Riders the weapon rules out (Archery on a greatsword, Reckless Attack's
  // note on a bow) are dropped before anything else looks at them. What's *on*
  // you joins what you *are*: active conditions (Bless) contribute riders of
  // their own, resolved by name from the bundled catalog — no weapon gating,
  // a condition doesn't care what you swing.
  const riders = useMemo(
    () => [
      ...applicableRiders(
        ridersFor(character, isAttack ? "attack" : "check"),
        context,
      ),
      ...conditionRiders(conditions, isAttack ? "attack" : "check"),
    ],
    [character, isAttack, context, conditions],
  );
  const [result, setResult] = useState<
    | (ReturnType<typeof rollD20Check> & {
        bonus?: { source: string; die: StandardDie; rolled: number[] }[];
      })
    | null
  >(null);
  // Bonus *dice* riders (Bless's d4) — rolled with the check, not folded into
  // the modifier: the whole point is real randomness, and the result line
  // shows the die it came from. Optional ones wait for a tick (the sheet
  // can't tell a save from a skill check); in manual mode the app still rolls
  // them — only the d20 itself belongs to the physical roller.
  const bonusDice = useMemo(
    () =>
      riders.flatMap((r) =>
        r.rider.rider === "bonusDice"
          ? [{ source: r.source, rider: r.rider }]
          : [],
      ),
    [riders],
  );
  const [chosenDice, setChosenDice] = useState<Set<string>>(new Set());
  const rollBonusDice = () =>
    bonusDice
      .filter((r) => !r.rider.optional || chosenDice.has(r.source))
      .map((r) => ({
        source: r.source,
        die: r.rider.die,
        rolled: Array.from(
          { length: r.rider.count },
          () => Math.floor(Math.random() * Number(r.rider.die.slice(1))) + 1,
        ),
      }));
  const bonusSum = (
    bonus: { source: string; die: StandardDie; rolled: number[] }[],
  ) => bonus.reduce((sum, b) => sum + b.rolled.reduce((s, v) => s + v, 0), 0);
  // Flat `bonus` riders fold into the modifier rather than the total — a d20
  // check's total can legitimately be negative, so `applyTotalRiders` (which
  // floors at 0) is the wrong tool here. Ones the weapon settles apply on their
  // own (Archery, once the bow is tagged); the rest wait for a tick.
  const { always, optional } = useMemo(
    () => flatBonusRiders(riders, context),
    [riders, context],
  );
  const [chosenBonuses, setChosenBonuses] = useState<Set<string>>(new Set());
  const activeBonus = riderFlatBonus(
    [...always, ...optional.filter((r) => chosenBonuses.has(r.source))],
    character,
  );
  const effectiveModifier = modifier + activeBonus;
  const threshold = critThreshold(riders);
  const roll = (mode: CheckMode) => {
    const rolled = rollD20Check(
      effectiveModifier,
      mode,
      riders,
      // Only an attack's crit stacks damage, and only when the table opted in.
      isAttack && explodingCriticals && onCrit ? threshold : undefined,
    );
    const bonus = rollBonusDice();
    const total = rolled.total + bonusSum(bonus);
    setResult({ ...rolled, total, bonus });
    onCrit?.(rolled.kept >= threshold, rolled.explosions ?? 0);
    onRolled?.({
      total,
      faces: rolled.dice,
      kept: rolled.kept,
      mode,
      ...(isAttack
        ? { critical: rolled.kept >= threshold, fumble: rolled.kept === 1 }
        : {}),
    });
  };
  return (
    <div className="column roll-section">
      {label && <p className="roll-section-title">{label}</p>}
      <p className="roll-formula">d20 {signed(effectiveModifier)}</p>
      {optional.map((r) => (
        <label key={r.source} className="row roll-extra-toggle">
          <input
            type="checkbox"
            checked={chosenBonuses.has(r.source)}
            onChange={(e) =>
              setChosenBonuses((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(r.source);
                else next.delete(r.source);
                return next;
              })
            }
          />
          <span>
            {r.source} (+
            {formatCustomFormula(r.rider.value, character, false)})
            {r.rider.note ? ` — ${r.rider.note}` : ""}
          </span>
        </label>
      ))}
      {bonusDice
        .filter((r) => r.rider.optional)
        .map((r) => (
          <label key={`dice:${r.source}`} className="row roll-extra-toggle">
            <input
              type="checkbox"
              checked={chosenDice.has(r.source)}
              onChange={(e) =>
                setChosenDice((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(r.source);
                  else next.delete(r.source);
                  return next;
                })
              }
            />
            <span>
              {r.source} (+{r.rider.count}
              {r.rider.die}){r.rider.note ? ` — ${r.rider.note}` : ""}
              {manual ? " — the app rolls this die" : ""}
            </span>
          </label>
        ))}
      {manual ? (
        // The die face rather than the total: the app still does the
        // arithmetic (so the ticked bonuses above count) and can call the
        // crit. Advantage happened at the table — type the die you kept.
        <ManualRollInput
          prompt="What did the d20 show?"
          min={1}
          max={20}
          onCommit={(face) => {
            const bonus = rollBonusDice();
            const total = face + effectiveModifier + bonusSum(bonus);
            setResult({
              dice: [face],
              kept: face,
              modifier: effectiveModifier,
              total,
              bonus,
            });
            onCrit?.(face >= threshold, 0);
            onRolled?.({
              total,
              faces: [face],
              kept: face,
              manual: true,
              ...(isAttack
                ? { critical: face >= threshold, fumble: face === 1 }
                : {}),
            });
          }}
        />
      ) : (
        <div className="row roll-modes">
          <button
            aria-label="Roll with disadvantage"
            onClick={() => roll("disadvantage")}
          >
            Disadv.
          </button>
          <button
            aria-label="Roll"
            className="btn-primary roll-go"
            onClick={() => roll("normal")}
          >
            Roll
          </button>
          <button
            aria-label="Roll with advantage"
            onClick={() => roll("advantage")}
          >
            Adv.
          </button>
        </div>
      )}
      {/* Feature riders and active conditions say the same kind of thing — "this
          roll may have advantage, you decide" — so they share one list rather
          than arriving as two competing sets of small print. Conditions come
          from the encounter, which is empty on the sheet and outside a fight. */}
      {[
        ...advantageNotes(riders),
        ...conditionRollNotes(conditions, isAttack ? "attack" : "check"),
      ].map((note) => (
        <p key={note} className="muted font-small">
          {note}
        </p>
      ))}
      {result &&
        (() => {
          const crit = critLabelFor(
            result.kept,
            isAttack,
            criticalsOnAllRolls,
            threshold,
          );
          const critClass =
            result.kept >= threshold && result.kept > 1
              ? "roll-crit-success"
              : "roll-crit-fail";
          return (
            <div className="column roll-result">
              {crit ? (
                <span className={`roll-total font-large ${critClass}`}>
                  {crit}
                </span>
              ) : (
                <span className="roll-total font-large">{result.total}</span>
              )}
              <span className="roll-part muted">
                d20{" "}
                {result.dice.length > 1
                  ? `(${result.dice.join(", ")} → ${result.kept})`
                  : `(${result.kept})`}{" "}
                {signed(result.modifier)}
              </span>
              {result.bonus?.map((b) => (
                <span key={b.source} className="roll-part muted">
                  +{b.rolled.reduce((s, v) => s + v, 0)} — {b.source} ({b.die}:{" "}
                  {b.rolled.join(", ")})
                </span>
              ))}
              {result.explosionDice && (
                <span className="roll-part muted">
                  Exploding: {result.explosionDice.join(", ")}
                  {result.explosions
                    ? ` — ${result.explosions + 1}× critical dice`
                    : " — no repeat"}
                </span>
              )}
            </div>
          );
        })()}
    </div>
  );
}

// Roll a spell/weapon effect — level-scaled spell damage, spell healing, or a
// fixed damage map. Reused as the "Damage"/"Healing" half of an attack.
function EffectControls({
  character,
  damage,
  spell,
  save,
  context = NO_CONTEXT,
  titled,
  critical = false,
  extraSets = 0,
  setCritical,
  onRolled,
}: {
  character: Character;
  damage?: CustomFormulaWithDamage;
  spell?: Spell;
  // Present on a save-based attack; used only to show what a successful save
  // leaves of the rolled damage.
  save?: SaveEffect;
  // The weapon being attacked with, as the rider conditions see it.
  context?: AttackContext;
  titled?: boolean;
  critical?: boolean;
  extraSets?: number;
  // Omitted when the effect can't crit (a save-based spell) — which also hides
  // the toggle.
  setCritical?: (crit: boolean) => void;
  // The rolled effect, on its way to the table: itemised by damage type (the
  // DM rules resistance, and can't from a lump sum) and by rider source (a
  // second Sneak Attack in one round is visible rather than folded in).
  onRolled?: (rolled: {
    stage: Extract<RollStage, "damage" | "healing">;
    total: number;
    parts?: ReportedDamage[];
    crit?: boolean;
    manual?: boolean;
    // The slot the spell went out at, so the label can say so.
    castLevel?: number;
  }) => void;
}) {
  const {
    settings: { criticalDamageMode },
  } = useSettings();
  const { rollMode } = useRollMode();
  const manual = rollMode === "manual";
  const mechanics = spell?.mechanics;
  const isHealing = !!mechanics?.healing;
  const isCantrip = mechanics?.level === 0;
  const charLevel = totalLevel(character.class);
  const [slotLevel, setSlotLevel] = useState<number | undefined>(undefined);

  // Extra-damage riders apply only to a weapon attack (a fixed `damage` map, no
  // spell) — never to spell damage or healing. `before-attack` riders would be
  // declared alongside the to-hit roll, so they're excluded here (none exist
  // yet). The rest are declared on the hit, i.e. with the damage roll.
  const extras = useMemo(
    () => [
      ...extrasForAttack(character, damage, spell, context),
      // Spell-damage bonuses (Potent Spellcasting, Empowered Evocation) ride the
      // same rendering/resolution; `extrasForAttack` is empty for a spell and
      // this is empty for a weapon, so the two never overlap.
      ...spellExtrasForCast(character, spell, isCantrip),
    ],
    [character, damage, spell, context, isCantrip],
  );
  // Opt-in extras (Sneak Attack, Divine Smite, Rage) start unchecked; the ones
  // the weapon's tags fully settle apply on their own. Keyed by source.
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const { dispatch } = useCharacter();

  // A slot-powered extra (Divine Smite): the player picks a slot level (which
  // scales the dice) and may toggle a situational bonus, then expends the slot
  // with an explicit button — kept off the re-rollable damage roll, like a hit
  // die spend. At most one is expected, so its state is scalar.
  const slotExtra = extras.find(({ rider }) => rider.slot);
  const [smiteLevel, setSmiteLevel] = useState<number | undefined>(undefined);
  const [smiteBonus, setSmiteBonus] = useState(false);
  const [smiteSpent, setSmiteSpent] = useState(false);
  const smiteLevels = useMemo(
    () =>
      slotExtra?.rider.slot
        ? availableSlotLevels(character, slotExtra.rider.slot.minLevel)
        : [],
    [slotExtra, character],
  );
  const effSmiteLevel =
    smiteLevel !== undefined && smiteLevels.includes(smiteLevel)
      ? smiteLevel
      : smiteLevels[0];
  const smiteActive =
    !!slotExtra && chosen.has(slotExtra.source) && effSmiteLevel !== undefined;

  // Pool-powered extras (a Rune Knight's Fire Rune): the dice ride the damage
  // roll like any other extra, and the use is spent by its own button afterwards
  // — the same separation as the smite's slot, so re-rolling costs nothing.
  // Unlike the smite these aren't assumed unique (a character can know several
  // runes), so the spent ones are tracked as a set of sources.
  const [usesSpent, setUsesSpent] = useState<Set<string>>(new Set());
  const usesRemaining = (pool: string) =>
    usesPoolState(character, pool)?.remaining ?? 0;
  const spendUses = (entry: ExtraDamageEntry) => {
    const pool = entry.rider.uses!.pool;
    const { updates } = resolveEffects(
      [{ effect: "spendUses", pool, amount: { fixed: 1 } }],
      { character },
    );
    updates.forEach((u) => dispatch(u));
    setUsesSpent((prev) => new Set(prev).add(entry.source));
  };

  // Only offer slot levels the character actually has unspent (and at/above the
  // spell's base level). Cantrips use no slots, so this is empty for them.
  const availableLevels = useMemo(
    () =>
      !mechanics || isCantrip
        ? []
        : availableSlotLevels(character, mechanics.level),
    [mechanics, isCantrip, character],
  );
  const noSlots = !!spell && !isCantrip && availableLevels.length === 0;
  const castLevel = isCantrip
    ? charLevel
    : slotLevel !== undefined && availableLevels.includes(slotLevel)
      ? slotLevel
      : (availableLevels[0] ?? mechanics?.level ?? 1);

  const map: CustomFormulaWithDamage = useMemo(
    () => damageMapFor(spell, damage, castLevel),
    [spell, damage, castLevel],
  );
  const healing = useMemo(
    () => (mechanics ? spellHealingAtLevel(mechanics, castLevel) : undefined),
    [mechanics, castLevel],
  );

  // The crit flavor is kept *with* the result, so toggling the checkbox
  // afterwards doesn't relabel a total that's already been rolled.
  const [damageResult, setDamageResult] = useState<DamageResolution | null>(
    null,
  );
  const [healResult, setHealResult] = useState<{
    total: number;
    dice: number[];
  } | null>(null);

  if (spell && !mechanics)
    return (
      <p className="muted">This spell has no structured effect to roll.</p>
    );

  const hasDamage = Object.keys(map).length > 0;
  // A crit inflates every damage die in the table's chosen flavor — the
  // weapon/spell's own dice and the dice of any extra-damage rider riding along
  // on the hit (Sneak Attack, Divine Smite) alike.
  const crit: CritSpec | undefined =
    setCritical && critical
      ? { mode: criticalDamageMode, extraSets }
      : undefined;
  // The spell's slot, when there was one — a cantrip and a weapon go out at no
  // level, and labelling either "(1st)" would be a lie.
  const reportedLevel = spell && !isCantrip ? castLevel : undefined;
  const rollDamageEffect = () => {
    const damageRiders = applicableRiders(
      ridersFor(character, "damage"),
      context,
    );
    const resolution = resolveDamage({
      character,
      map,
      extras,
      chosen,
      riders: damageRiders,
      crit,
      slot:
        smiteActive && slotExtra
          ? {
              entry: slotExtra,
              level: effSmiteLevel!,
              withBonus: smiteBonus,
            }
          : undefined,
      applyTotals: (t) => applyTotalRiders(t, damageRiders, character, context),
    });
    setDamageResult(resolution);
    onRolled?.({
      stage: "damage",
      total: resolution.total,
      parts: [
        ...resolution.parts.map((p) => ({
          total: p.total,
          damageType: p.damageType,
        })),
        ...resolution.extras.map((e) => ({
          total: e.total,
          damageType: e.damageType,
          source: e.source,
        })),
      ],
      crit: !!resolution.critical,
      castLevel: reportedLevel,
    });
  };
  // Spend the chosen slot that powers the smite (an explicit, one-time commit,
  // mirroring the hit-die apply — so it syncs/undoes like any edit).
  const expendSmite = () => {
    if (!smiteActive || smiteSpent || effSmiteLevel === undefined) return;
    const { updates } = resolveEffects([{ effect: "expendSlot" }], {
      character,
      chosenLevel: effSmiteLevel as LeveledSpellLevel,
    });
    updates.forEach((u) => dispatch(u));
    setSmiteSpent(true);
  };
  const rollHealEffect = () => {
    const dice: number[] = [];
    const healingRiders = ridersFor(character, "healing");
    const total = applyTotalRiders(
      rollFormula(healing!, character, dice, healingRiders),
      healingRiders,
      character,
    );
    setHealResult({ total, dice });
    onRolled?.({ stage: "healing", total, castLevel: reportedLevel });
  };

  return (
    <div className="column roll-section">
      {titled && (
        <p className="roll-section-title">{isHealing ? "Healing" : "Damage"}</p>
      )}
      {spell && mechanics && !isCantrip && !noSlots && (
        <label className="row roll-level-select">
          Cast at:{" "}
          <select
            value={castLevel}
            onChange={(e) => setSlotLevel(Number(e.target.value))}
          >
            {availableLevels.map((lvl) => (
              <option key={lvl} value={lvl}>
                {ordinalSlot(lvl)} level
              </option>
            ))}
          </select>
        </label>
      )}
      {noSlots && <p className="muted">No spell slots available.</p>}
      {isCantrip && (mechanics?.scaling || mechanics?.damageTable) && (
        <p className="muted">Scales with character level ({charLevel}).</p>
      )}

      {isHealing ? (
        <>
          <p className="roll-formula">
            {formatCustomFormula(healing!, character, false)}
          </p>
          {manual ? (
            !noSlots && (
              <ManualRollInput
                prompt="Total healing"
                min={0}
                onCommit={(total) => {
                  setHealResult({ total, dice: [] });
                  onRolled?.({
                    stage: "healing",
                    total,
                    manual: true,
                    castLevel: reportedLevel,
                  });
                }}
              />
            )
          ) : (
            <button
              className="btn-primary roll-go"
              disabled={noSlots}
              onClick={rollHealEffect}
            >
              Roll Healing
            </button>
          )}
          {healResult && (
            <div className="column roll-result">
              <span className="roll-total font-large">{healResult.total}</span>
              <span className="roll-part muted">
                HP
                {breakdown(healResult.total, healResult.dice)}
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="roll-formula">
            {hasDamage
              ? formatCustomFormulaWithDamage(map, character, false)
              : "No damage dice"}
          </p>
          {/* With real dice the entered total is the authority, so the extras
              become reminders of what to add at the table instead of
              checkboxes that would change nothing. */}
          {manual && extras.length > 0 && (
            <div className="column roll-extras">
              {extras.map(({ source, rider }) => (
                <p key={source} className="muted font-small">
                  {rider.slot
                    ? `${source} (${dieLabel(rider.slot.die)}s scale with the slot you expend)`
                    : `${source} (+${formatCustomFormula(rider.amount, character, false)}${rider.oncePerTurn ? ", once/turn" : ""})`}
                  {rider.uses
                    ? ` — costs a use of ${rider.uses.pool} (${usesRemaining(rider.uses.pool)} left)`
                    : ""}
                  {rider.note ? ` — ${rider.note}` : ""}
                </p>
              ))}
            </div>
          )}
          {!manual && extras.length > 0 && (
            <div className="column roll-extras">
              {extras.map(({ source, rider, optIn }) => {
                const toggle = (checked: boolean) =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(source);
                    else next.delete(source);
                    return next;
                  });
                // Slot-powered extra (Divine Smite): checkbox → slot selector +
                // situational-bonus toggle. Dice scale with the chosen level.
                if (rider.slot) {
                  const slot = rider.slot;
                  const checked = chosen.has(source);
                  const count = critDiceCount(
                    effSmiteLevel !== undefined
                      ? slotDiceCount(slot, effSmiteLevel) +
                          (smiteBonus && slot.bonus ? slot.bonus.dice : 0)
                      : slot.diceAtMin,
                    crit,
                  );
                  return (
                    <div key={source} className="column roll-extra">
                      <label className="row roll-extra-toggle">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={smiteLevels.length === 0}
                          onChange={(e) => toggle(e.target.checked)}
                        />
                        <span>
                          {source} ({count}
                          {dieLabel(slot.die)}
                          {rider.damageType ? ` ${rider.damageType}` : ""})
                        </span>
                      </label>
                      {smiteLevels.length === 0 ? (
                        <p className="muted font-small">
                          No spell slots available.
                        </p>
                      ) : (
                        checked && (
                          <>
                            <label className="row roll-extra-toggle">
                              Slot:{" "}
                              <select
                                value={effSmiteLevel}
                                onChange={(e) =>
                                  setSmiteLevel(Number(e.target.value))
                                }
                              >
                                {smiteLevels.map((l) => (
                                  <option key={l} value={l}>
                                    {ordinalSlot(l)} level
                                  </option>
                                ))}
                              </select>
                            </label>
                            {slot.bonus && (
                              <label className="row roll-extra-toggle">
                                <input
                                  type="checkbox"
                                  checked={smiteBonus}
                                  onChange={(e) =>
                                    setSmiteBonus(e.target.checked)
                                  }
                                />
                                <span>{slot.bonus.label}</span>
                              </label>
                            )}
                          </>
                        )
                      )}
                      {rider.note && (
                        <p className="muted font-small">{rider.note}</p>
                      )}
                    </div>
                  );
                }
                // Pool-powered extra (a Rune Knight's Fire Rune): the same
                // checkbox, labelled with what's left in the pool and unticked
                // once it's empty. The use itself is spent after the roll.
                const pool = rider.uses?.pool;
                const left = pool ? usesRemaining(pool) : undefined;
                const label =
                  `${source} (+${formatCustomFormula(rider.amount, character, false)}${rider.oncePerTurn ? ", once/turn" : ""})` +
                  (pool ? ` — ${left} use${left === 1 ? "" : "s"} left` : "");
                return optIn ? (
                  <div key={source} className="column roll-extra">
                    <label className="row roll-extra-toggle">
                      <input
                        type="checkbox"
                        checked={chosen.has(source)}
                        disabled={left === 0}
                        onChange={(e) => toggle(e.target.checked)}
                      />
                      <span>{label}</span>
                    </label>
                    {rider.note && (
                      <p className="muted font-small">{rider.note}</p>
                    )}
                  </div>
                ) : (
                  <p key={source} className="muted font-small">
                    {label}
                    {rider.note ? ` — ${rider.note}` : ""}
                  </p>
                );
              })}
            </div>
          )}
          {/* With real dice the crit stays a reminder, not a checkbox — the
              entered total is the authority, so the app's only job is to say
              which house rule the player should be applying to their own
              dice. Without this line a manual nat 20 said "Critical Hit" in
              the to-hit half and then asked for damage as if nothing had
              happened. */}
          {manual && crit && hasDamage && (
            <p className="muted font-small">
              Critical hit — {CRIT_MODE_LABELS[criticalDamageMode]} — apply it
              to the total you enter.
            </p>
          )}
          {!manual && setCritical && hasDamage && (
            <label className="row roll-extra-toggle roll-crit-toggle">
              <input
                type="checkbox"
                checked={critical}
                onChange={(e) => setCritical(e.target.checked)}
              />
              <span>Critical hit — {CRIT_MODE_LABELS[criticalDamageMode]}</span>
            </label>
          )}
          {manual ? (
            hasDamage &&
            !noSlots && (
              <ManualRollInput
                prompt="Total damage"
                min={0}
                onCommit={(total) => {
                  setDamageResult({ total, parts: [], extras: [] });
                  onRolled?.({
                    stage: "damage",
                    total,
                    manual: true,
                    crit: !!crit,
                    castLevel: reportedLevel,
                  });
                }}
              />
            )
          ) : (
            <button
              className="btn-primary roll-go"
              disabled={!hasDamage || noSlots}
              onClick={rollDamageEffect}
            >
              Roll {crit && "Critical "}Damage
            </button>
          )}
          {damageResult && (
            <div className="column roll-result">
              <span
                className={`roll-total font-large ${damageResult.critical ? "roll-crit-damage" : ""}`}
              >
                {damageResult.total}
              </span>
              {damageResult.critical && (
                <span className="roll-part muted">
                  Critical — {CRIT_MODE_LABELS[damageResult.critical.mode]}
                  {damageResult.critical.extraSets
                    ? ` ×${damageResult.critical.extraSets + 1} (exploded)`
                    : ""}
                </span>
              )}
              {/* The save itself is the DM's roll, so the sheet just reports
                  the outcome's number: full damage on a failed save, and the
                  reduced figure on a success (5e rounds down). */}
              {save?.onSuccess && (
                <span className="roll-part muted">
                  Failed save: {damageResult.total} — Successful save:{" "}
                  {damageOnSave(damageResult.total, save.onSuccess)}
                </span>
              )}
              {damageResult.parts.map((p) => {
                const parts = formatRollBreakdown(
                  p.total,
                  p.dice,
                  damageResult.critical,
                );
                return (
                  <span key={p.damageType} className="roll-part">
                    {p.total} {p.damageType}
                    {parts ? ` (${parts})` : ""}
                  </span>
                );
              })}
              {damageResult.extras.map((e) => {
                const parts = formatRollBreakdown(
                  e.total,
                  e.dice,
                  damageResult.critical,
                );
                return (
                  <span key={e.source} className="roll-part">
                    +{e.total}{" "}
                    {e.damageType ??
                      (spell ? "(spell's type)" : "(weapon type)")}{" "}
                    — {e.source}
                    {parts ? ` (${parts})` : ""}
                  </span>
                );
              })}
              {smiteActive &&
                (smiteSpent ? (
                  <span className="roll-part muted">
                    {ordinalSlot(effSmiteLevel!)}-level slot expended
                  </span>
                ) : (
                  <button onClick={expendSmite}>
                    Expend {ordinalSlot(effSmiteLevel!)}-level slot
                  </button>
                ))}
              {/* The pool cost, paid on its own button — so a re-roll is free,
                  and a feature whose use survives the hit (a ranger's already
                  marked Favored Foe) simply isn't charged again. With real dice
                  there's no checkbox to tick, so every candidate is offered. */}
              {extras
                .filter(
                  ({ source, rider }) =>
                    rider.uses && (manual || chosen.has(source)),
                )
                .map((entry) =>
                  usesSpent.has(entry.source) ? (
                    <span key={entry.source} className="roll-part muted">
                      {entry.rider.uses!.pool} use spent
                    </span>
                  ) : (
                    <button
                      key={entry.source}
                      disabled={usesRemaining(entry.rider.uses!.pool) < 1}
                      onClick={() => spendUses(entry)}
                    >
                      Spend a use of {entry.rider.uses!.pool}
                    </button>
                  ),
                )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Spend a hit die: roll 1d<die> + CON, then apply — heal current HP (clamped to
// max HP, with any minimum-total rider like Durable) and mark one die expended.
// The apply step goes through the mechanics resolver, so the writes are the
// same effect data any catalog action produces — and they sync/undo like any
// edit (play-mode dispatching is fine; the limited-use pips already do it).
function HitDieControls({
  character,
  die,
  onRolled,
}: {
  character: Character;
  die: StandardDie;
  // The roll on its way to the table, healing riders included — reported as
  // it lands, like every other roll, so the DM's queue explains the HP change
  // the projection is about to show them.
  onRolled?: (rolled: Pick<OutgoingRoll, "total" | "manual">) => void;
}) {
  const { dispatch } = useCharacter();
  const { rollMode } = useRollMode();
  const manual = rollMode === "manual";
  const formula: CustomFormula = useMemo(() => hitDieFormula(die), [die]);
  const riders = useMemo(() => ridersFor(character, "hitDie"), [character]);
  const remaining = remainingHitDice(character, die);
  const [result, setResult] = useState<{
    total: number;
    dice: number[];
    applied: number | null;
  } | null>(null);

  const land = (total: number, dice: number[], manualEntry?: true) => {
    setResult({ total, dice, applied: null });
    onRolled?.({
      total: hitDieHealing(character, total),
      ...(manualEntry ? { manual: manualEntry } : {}),
    });
  };

  const roll = () => {
    const dice: number[] = [];
    land(rollFormula(formula, character, dice, riders), dice);
  };

  const healing = result ? hitDieHealing(character, result.total) : 0;
  const gained = result
    ? Math.min(maxHpValue(character), character.currHp + healing) -
      character.currHp
    : 0;
  // Only full HP makes applying pointless. `gained` alone can't gate the
  // button: a negative CON floors a hit die at 0 healing, and that die was
  // still rolled and still needs spending.
  const atFullHp = character.currHp >= maxHpValue(character);

  const apply = () => {
    if (!result || result.applied !== null) return;
    const { updates } = resolveEffects(
      [
        { effect: "heal", amount: { fixed: healing } },
        { effect: "spendHitDie", die },
      ],
      { character },
    );
    updates.forEach((update) => dispatch(update));
    setResult({ ...result, applied: gained });
  };

  return (
    <div className="column roll-section">
      <p className="roll-formula">
        {formatCustomFormula(formula, character, false)}
      </p>
      {remaining > 0 ? (
        <p className="muted">
          {remaining} {die} remaining
        </p>
      ) : (
        <p className="muted">No hit dice remaining.</p>
      )}
      {manual ? (
        remaining > 0 && (
          <ManualRollInput
            prompt="Total rolled, modifiers included"
            // A negative CON can floor a hit die at 0 — still a rolled die the
            // player needs to spend, so 0 must be enterable.
            min={0}
            onCommit={(total) => land(total, [], true)}
          />
        )
      ) : (
        <button
          className="btn-primary roll-go"
          disabled={remaining <= 0}
          onClick={roll}
        >
          Roll
        </button>
      )}
      {result && (
        <div className="column roll-result">
          <span className="roll-total font-large">{healing}</span>
          <span className="roll-part muted">
            HP{breakdown(result.total, result.dice)}
            {healing > result.total && " (Durable minimum)"}
          </span>
          {result.applied !== null ? (
            <span className="roll-part">Applied +{result.applied} HP</span>
          ) : (
            <button
              onClick={apply}
              disabled={atFullHp}
              title={atFullHp ? "Already at full HP" : undefined}
            >
              {gained < healing
                ? `Heal +${gained} HP (max) & spend 1 ${die}`
                : `Heal +${gained} HP & spend 1 ${die}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// A death saving throw. Flat d20 — no modifier, no advantage buttons, because
// nothing in 5e improves this roll and offering the choice would imply
// otherwise.
//
// The dialog reads the outcome rather than leaving the player to: a nat 1
// costs two failures, a nat 20 skips the track entirely and puts you back up
// at 1 hit point, and three of either ends it. Applying is still a separate,
// deliberate press, like the hit-die spend — the app never marks your own
// death saves for you.
function DeathSaveControls({
  character,
  onRolled,
}: {
  character: Character;
  onRolled?: (
    rolled: Pick<
      OutgoingRoll,
      "label" | "total" | "faces" | "kept" | "critical" | "fumble" | "manual"
    >,
  ) => void;
}) {
  const { dispatch } = useCharacter();
  const { rollMode } = useRollMode();
  const [face, setFace] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);
  const saves = character.deathSaves;
  const result = face === null ? null : resolveDeathSave(face, saves);

  const land = (rolled: number, manual?: true) => {
    setFace(rolled);
    setApplied(false);
    const outcome = resolveDeathSave(rolled, saves);
    onRolled?.({
      // The verdict rides in the label, so the seat reads "failure (2 of 3)"
      // rather than a bare number it would have to score itself.
      label: `Death save — ${describeDeathSave(outcome)}`,
      total: rolled,
      faces: [rolled],
      kept: rolled,
      ...(rolled >= 20 ? { critical: true } : {}),
      ...(rolled <= 1 ? { fumble: true } : {}),
      ...(manual ? { manual } : {}),
    });
  };

  const apply = () => {
    if (!result || applied) return;
    dispatch(
      updateAt(charPath(FIELD.deathSaves), {
        successes: result.successes,
        failures: result.failures,
      }),
    );
    if (result.revivedAtHp !== undefined) {
      dispatch(updateAt(charPath(FIELD.currHp), result.revivedAtHp));
    }
    setApplied(true);
  };

  return (
    <div className="column roll-section">
      <p className="roll-formula">d20</p>
      <p className="muted font-small">
        {saves.successes} of 3 successes · {saves.failures} of 3 failures
      </p>
      {rollMode === "manual" ? (
        <ManualRollInput
          prompt="What did the d20 show?"
          min={1}
          max={20}
          onCommit={(rolled) => land(rolled, true)}
        />
      ) : (
        <button
          className="btn-primary roll-go"
          onClick={() => land(rollD20Check(0).kept)}
        >
          Roll
        </button>
      )}
      {result && (
        <div className="column roll-result">
          <span
            className={classNames("roll-total font-large", {
              "roll-crit-success": result.verdict === "revived",
              "roll-crit-fail": result.verdict === "dead",
            })}
          >
            {face}
          </span>
          <span className="roll-part">{describeDeathSave(result)}</span>
          {applied ? (
            <span className="roll-part muted">Marked</span>
          ) : (
            <button onClick={apply}>
              {result.revivedAtHp !== undefined
                ? "Get back up at 1 HP"
                : "Mark it"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Roll a single dice formula on its own.
function FormulaControls({
  character,
  formula,
}: {
  character: Character;
  formula: CustomFormula;
}) {
  const { rollMode } = useRollMode();
  const [result, setResult] = useState<{
    total: number;
    dice: number[];
  } | null>(null);
  const roll = () => {
    const dice: number[] = [];
    setResult({ total: rollFormula(formula, character, dice), dice });
  };
  return (
    <div className="column roll-section">
      <p className="roll-formula">
        {formatCustomFormula(formula, character, false)}
      </p>
      {rollMode === "manual" ? (
        <ManualRollInput
          prompt="Total rolled, modifiers included"
          min={0}
          onCommit={(total) => setResult({ total, dice: [] })}
        />
      ) : (
        <button className="btn-primary roll-go" onClick={roll}>
          Roll
        </button>
      )}
      {result && (
        <div className="column roll-result">
          <span className="roll-total font-large">{result.total}</span>
          {formatRollBreakdown(result.total, result.dice) && (
            <span className="roll-part muted">
              {formatRollBreakdown(result.total, result.dice)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Shell({
  label,
  close,
  children,
}: React.PropsWithChildren<{ label: string; close: () => void }>) {
  return (
    <div className="modal-container">
      <div className="modal-background" onClick={close} />
      <div className="modal-content roll-modal">
        <div className="row space-between modal-titlebar">
          <b className="title font-large">Roll: {label}</b>
          <div className="modal-titlebar-buttons">
            <button
              className="icon-btn close"
              onClick={close}
              aria-label="Close"
              title="Close"
            >
              <FaXmark />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
