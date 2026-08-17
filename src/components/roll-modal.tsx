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
  conditionExtras,
  conditionExtrasAgainst,
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
  SKILL_SOURCE_STATS,
} from "src/lib/rules";
import { hitDieFormula } from "src/lib/rest";
import {
  advantageNotes,
  applyTotalRiders,
  critThreshold,
  flatBonusRiders,
  hitDieHealing,
  riderFlatBonus,
  critDiceRiders,
  ridersFor,
} from "src/lib/mechanics/riders";
import { maxHpValue, resolveEffects } from "src/lib/mechanics/resolve";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import {
  conditionRollNotes,
  conditionTargetNotes,
} from "src/lib/play/conditions";
import { OutgoingRoll, ReportedDamage, RollStage } from "src/lib/play/reports";
import { calculateCustomFormula } from "src/lib/formula";
import { RollRequest } from "src/lib/hooks/use-roller";
import { isFoe, Participant } from "src/lib/play/encounter";
import {
  conditionRiders,
  conditionSummary,
  ridersAgainst,
} from "src/lib/play/condition-mechanics";
import { spellConditionFor } from "src/lib/spells/spell-conditions";
import {
  RollContext,
  applicableRiders,
  attackContext,
} from "src/lib/mechanics/conditions";
import {
  HitDie,
  LeveledSpellLevel,
  StandardDie,
} from "src/lib/data/data-definitions";
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
import Select from "src/components/select";

const dieLabel = (die: DieDefinition) =>
  typeof die === "string" ? die : `d${die.numFaces}`;

const totalLevel = (levels: { level: number }[]) =>
  levels.reduce((sum, c) => sum + (c.level || 0), 0);

const ordinalSlot = (n: number) =>
  `${n}${["th", "st", "nd", "rd"][n % 10 > 3 || (n >= 11 && n <= 13) ? 0 : n % 10]}`;

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// Formats the dice breakdown suffix (" — 4 + 3 + 2"), or "" when there's nothing to explain.
const breakdown = (total: number, dice: number[], crit?: CritSpec) => {
  const parts = formatRollBreakdown(total, dice, crit);
  return parts ? ` — ${parts}` : "";
};

// Stable empty identity so memoized rider lists don't churn on every render.
const NO_CONTEXT: RollContext = {};

// In-dialog wording for each crit flavor.
const CRIT_MODE_LABELS: Record<CritMode, string> = {
  raw: "double the damage dice",
  maxDice: "maximize the dice, then roll again",
  total: "double the total, modifiers included",
};

// The roll dialog. Reuses modal CSS but not ModalContainer (no draft/targeted-field
// coupling). An "attack" surfaces its to-hit and damage together.
export default function RollModal() {
  const { character } = useCharacter();
  const { request, closeRoller } = useRoller();
  if (!request || !character) return <></>;
  // key={request.id} forces a remount so a second attack in a row doesn't
  // show the first one's result.
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
  // Shared between the two halves of an attack: to-hit sets it on a crit range hit,
  // damage inflates its dice. Manually overridable since not every crit condition
  // (paralyzed target, surprise round) is tracked. extraSets = exploding-crits count.
  const [critical, setCritical] = useState(false);
  const [extraSets, setExtraSets] = useState(0);
  // Weapon properties for rider conditions, derived once so to-hit and damage agree.
  const context = useMemo(() => {
    if (spec.kind === "attack" && spec.attack)
      return attackContext(spec.attack);
    if (spec.kind === "check" && !spec.save)
      return {
        skill: spec.skill,
        proficient: spec.proficient,
        ...(spec.skill ? { ability: SKILL_SOURCE_STATS[spec.skill] } : {}),
      };
    return NO_CONTEXT;
  }, [spec]);

  const isHealing = spec.kind === "attack" && !!spec.spell?.mechanics?.healing;
  // A weapon/ability carries its own `save`; a spell's DC comes from spellSaveEffect.
  const saveEffect =
    spec.kind === "attack"
      ? (spec.save ?? spellSaveEffect(character, spec.spell))
      : undefined;
  // The condition this cast applies to targets (Bless, Hideous Laughter), looked
  // up by spell title.
  const conditionGrant =
    spec.kind === "attack" ? spellConditionFor(spec.spell) : undefined;
  // Save/condition effects target a set (everyone in the blast); an attack
  // roll targets exactly one creature.
  const multiTarget =
    spec.kind === "attack" &&
    spec.toHit === undefined &&
    !isHealing &&
    (!!saveEffect || !!conditionGrant);
  const targeting = useTargeting(
    request.id,
    spec.kind === "attack",
    multiTarget,
    // Self-targetable: healing, or a save-less condition (a buff).
    isHealing || (!!conditionGrant && !saveEffect),
    request.attemptBase,
  );
  const { targetId, report } = targeting;
  // Target row for single-target marks (Hex, Faerie Fire) and advisory notes.
  const targetParticipant =
    !multiTarget && targetId
      ? targeting.targets.find((t) => t.id === targetId)
      : undefined;
  const mechanics = spec.kind === "attack" ? spec.spell?.mechanics : undefined;
  // Whether there's anything to roll; no-dice effects (Hideous Laughter) use
  // the announce path below.
  const hasRollableEffect =
    spec.kind === "attack" &&
    !!(
      spec.damage ||
      mechanics?.damage ||
      mechanics?.damageTable ||
      mechanics?.healing
    );

  // The save DC/stat, formatted so the DM can rule without asking.
  const save = saveEffect
    ? {
        dc: calculateCustomFormula(saveEffect.dc, character),
        ...(saveEffect.stat ? { stat: saveEffect.stat } : {}),
        ...(saveEffect.onSuccess ? { onSuccess: saveEffect.onSuccess } : {}),
      }
    : undefined;
  // Rides every report of this exchange; table-talk turns it into consent
  // prompts and apply buttons.
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
      {/* Target chosen before any dice, so to-hit and damage both arrive addressed. */}
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
            isSave={!!spec.save}
            context={context}
            onRolled={(rolled) =>
              report({ stage: "check", label: request.label, ...rolled }, false)
            }
          />
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
          // Untargeted healing: HP write is local, this just reports why.
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
              target={targetParticipant}
              selfId={targeting.selfId}
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
          {/* Condition granted, shown before rolling. */}
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
              target={targetParticipant}
              selfId={targeting.selfId}
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
                      // Un-ticking drops any exploding stack with it.
                      setExtraSets(0);
                    }
                  : undefined
              }
            />
          ) : (
            // No dice at all (Hideous Laughter, a stunning gaze): the target
            // rolls, this side only declares.
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

// Tracks the chosen target(s) and reports rolls stamped with exchange + attempt
// number. `multi` is the save-based shape (a Fireball names every creature in
// the blast; an attack roll names exactly one).
function useTargeting(
  exchangeId: string,
  isAttack: boolean,
  multi: boolean,
  // Healing may target yourself; attacks never list you.
  includeSelf: boolean,
  // Attempts already sent under this exchange before the dialog opened.
  attemptBase = 0,
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
  // Grouped by side (foes/party) rather than one flat roster.
  const foes = useMemo(() => targets.filter(isFoe), [targets]);
  const party = useMemo(() => {
    const rest = targets.filter((t) => !isFoe(t));
    // Yourself first when offered — a heal's likeliest target.
    return includeSelf && selfId
      ? [
          ...rest.filter((t) => t.id === selfId),
          ...rest.filter((t) => t.id !== selfId),
        ]
      : rest;
  }, [targets, includeSelf, selfId]);
  const enabled = isAttack && reportsEnabled && targets.length > 0;
  // Pre-fills the last target, attacks only (a check/hit die must not inherit
  // it), and only if still in the order.
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
  // Attempts counted locally per stage, so re-rolls before a target is named
  // still number correctly once it's sent.
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
      const attempt = (attempts.current[roll.stage] ?? attemptBase) + 1;
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
      // Rolled before a target is named: held, then sent once one is picked.
      if (needsTarget && !chosen) {
        held.current[roll.stage] = full;
        return;
      }
      delete held.current[roll.stage];
      sendReport(full);
    },
    [exchangeId, sendReport, multi, attemptBase],
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
    targets,
    foes,
    party,
    targetId,
    setTargetId,
    targetIds,
    toggleTarget,
    report,
  };
}

// Enemies first, unless healing (then party first).
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

// Exported for ability action rows (Stunning Strike, Inspire); `verb`
// overrides the attack/heal wording there.
export function TargetPicker({
  healing,
  verb,
  selfId,
  foes,
  party,
  targetId,
  setTargetId,
}: {
  healing: boolean;
  verb?: string;
  selfId?: string;
  foes: Participant[];
  party: Participant[];
  targetId: string;
  setTargetId: (id: string) => void;
}) {
  return (
    <span className="row roll-target">
      <span>{verb ?? (healing ? "Healing" : "Attacking")}</span>
      <Select
        label={
          verb
            ? `Who ${verb.toLowerCase()} targets`
            : healing
              ? "Who you are healing"
              : "Who you are attacking"
        }
        placeholder="Choose a target…"
        value={targetId}
        // Row hint shows existing conditions (to tell two Goblins apart); HP
        // is deliberately omitted — visibility is the DM's call.
        options={targetGroups(healing, foes, party).flatMap(([label, list]) =>
          list.map((p) => ({
            value: p.id,
            label: p.id === selfId ? `${p.name} (you)` : p.name,
            group: label,
            hint: p.conditions.length
              ? p.conditions.map((c) => c.name).join(", ")
              : undefined,
          })),
        )}
        onChange={setTargetId}
      />
    </span>
  );
}

// Save-based counterpart to TargetPicker: checkboxes for a set of targets,
// same grouping. Exported for ability rows' save-the-room uses (Turn the Unholy).
export function TargetMultiPicker({
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

// Manual entry for physical dice: one input + submit.
export function ManualRollInput({
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

// Announce-only button for no-dice effects; only enabled once targeted.
// Re-announcing is numbered like a re-roll, never blocked.
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

// Save DC display only — the target's own roll happens elsewhere.
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

// Crit label for the kept d20: attacks always show it (nat 20, or higher with
// Improved Critical), other checks only when the "criticals on all rolls"
// setting is on.
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

// d20+modifier roll with advantage/disadvantage; reused for a standalone
// check and the "To Hit" half of an attack. Riders (rerolls, min dice, crit
// range) come from character features.
function CheckControls({
  character,
  modifier,
  label,
  isAttack = false,
  isSave = false,
  context = NO_CONTEXT,
  target,
  selfId,
  onCrit,
  onRolled,
}: {
  character: Character;
  modifier: number;
  label?: string;
  isAttack?: boolean;
  // Saving throw vs. ability/skill check — save-only riders key off this.
  isSave?: boolean;
  // Target row for marks on it (True Strike, Faerie Fire) and advisory notes;
  // selfId is who is rolling, for caster-only marks.
  target?: Participant;
  selfId?: string;
  // Weapon context for rider conditions; empty for a plain/spell check.
  context?: RollContext;
  // Reports crit + exploding-crit count so the damage half can inflate dice;
  // re-rolling reports the new verdict.
  onCrit?: (crit: boolean, explosions: number) => void;
  // Called for every d20, including re-rolls.
  onRolled?: (
    rolled: Pick<
      OutgoingRoll,
      | "total"
      | "faces"
      | "kept"
      | "mode"
      | "critical"
      | "fumble"
      | "manual"
      | "bonuses"
    >,
  ) => void;
}) {
  const {
    settings: { criticalsOnAllRolls, explodingCriticals },
  } = useSettings();
  const { rollMode } = useRollMode();
  const manual = rollMode === "manual";
  const { selfConditions: conditions } = useEncounter();
  // Riders the weapon rules out are dropped first; active conditions (Bless)
  // add their own riders regardless of weapon.
  const d20Kind = isAttack ? "attack" : isSave ? "save" : "check";
  const riders = useMemo(
    () => [
      ...applicableRiders(ridersFor(character, d20Kind), context),
      ...conditionRiders(conditions, d20Kind),
      // Marks on the chosen target, cashing out for this roller.
      ...ridersAgainst(target?.conditions ?? [], selfId, d20Kind),
    ],
    [character, d20Kind, context, conditions, target, selfId],
  );
  const [result, setResult] = useState<
    | (ReturnType<typeof rollD20Check> & {
        bonus?: { source: string; die: StandardDie; rolled: number[] }[];
      })
    | null
  >(null);
  // Bonus dice riders (Bless's d4) roll separately from the modifier and show
  // their own die. Optional ones need a tick; rolled by the app even in
  // manual mode — only the d20 itself is physical.
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
  // Bonus dice in wire shape, itemised by source ("+5 — Bless (4, 1)").
  const reportedBonuses = (
    bonus: { source: string; die: StandardDie; rolled: number[] }[],
  ) =>
    bonus.length
      ? {
          bonuses: bonus.map((b) => ({
            source: b.source,
            total: b.rolled.reduce((s, v) => s + v, 0),
            dice: b.rolled,
          })),
        }
      : {};
  // Flat bonus riders fold into the modifier, not the total: applyTotalRiders
  // floors at 0, but a d20 total can legitimately be negative.
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
      ...reportedBonuses(bonus),
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
        // Enters the die face, not the total — app still computes bonuses
        // and crit; advantage was resolved at the table.
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
              ...reportedBonuses(bonus),
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
      {/* Feature riders and active conditions share one notes list. */}
      {[
        ...advantageNotes(riders),
        ...conditionRollNotes(conditions, d20Kind),
        // Target's state (Prone, Restrained) affects this roll too.
        ...conditionTargetNotes(
          (target?.conditions ?? []).map((c) => c.name),
          d20Kind,
        ),
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
  target,
  selfId,
  titled,
  critical = false,
  extraSets = 0,
  setCritical,
  onRolled,
}: {
  character: Character;
  damage?: CustomFormulaWithDamage;
  spell?: Spell;
  // Present on a save-based attack; shows what a successful save leaves.
  save?: SaveEffect;
  // Weapon context for rider conditions.
  context?: RollContext;
  // Target row — marks on it (Hex's d6) pay out here.
  target?: Participant;
  selfId?: string;
  titled?: boolean;
  critical?: boolean;
  extraSets?: number;
  // Omitted when the effect can't crit (a save-based spell) — hides the toggle.
  setCritical?: (crit: boolean) => void;
  // Rolled effect itemised by damage type (for resistance rulings) and rider
  // source (so a second Sneak Attack in one round is visible, not folded in).
  onRolled?: (rolled: {
    stage: Extract<RollStage, "damage" | "healing">;
    total: number;
    parts?: ReportedDamage[];
    crit?: boolean;
    manual?: boolean;
    // The slot the spell went out at, so the label can say so.
    castLevel?: number;
    // A landed extra's condition (Fire Rune's Restrained).
    condition?: { name: string; rounds?: number };
  }) => void;
}) {
  const {
    settings: { criticalDamageMode },
  } = useSettings();
  const { rollMode } = useRollMode();
  const manual = rollMode === "manual";
  const { selfConditions } = useEncounter();
  const mechanics = spell?.mechanics;
  const isHealing = !!mechanics?.healing;
  const isCantrip = mechanics?.level === 0;
  const charLevel = totalLevel(character.class);
  const [slotLevel, setSlotLevel] = useState<number | undefined>(undefined);

  // Extra-damage riders apply only to a weapon attack (a fixed `damage` map),
  // never to spell damage or healing.
  const extras = useMemo(
    () => [
      ...extrasForAttack(character, damage, spell, context),
      // Spell-damage bonuses (Potent Spellcasting); extrasForAttack and this
      // never overlap (weapon vs. spell).
      ...spellExtrasForCast(character, spell, isCantrip),
      // What's on the bearer joins in (Divine Favor's radiant d4), not weapon-gated.
      ...conditionExtras(selfConditions),
      // Marks on the target cash out too (Hex's necrotic d6, hexer only).
      ...conditionExtrasAgainst(target?.conditions ?? [], selfId),
    ],
    [
      character,
      damage,
      spell,
      context,
      isCantrip,
      selfConditions,
      target,
      selfId,
    ],
  );
  // Opt-in extras (Sneak Attack, Divine Smite, Rage) start unchecked; ones the
  // weapon's tags fully settle apply on their own. Keyed by source.
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const { dispatch } = useCharacter();

  // Slot-powered extra (Divine Smite): slot level + optional bonus, expended
  // via its own button (like a hit-die spend). At most one expected, so state
  // is scalar.
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

  // Pool-powered extras (Fire Rune): dice roll with the damage, use spent via
  // its own button after. Tracked as a set since a character can know several.
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

  // Only offer slot levels the character has unspent; empty for cantrips.
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

  // Crit flavor is kept with the result so toggling the checkbox afterward
  // doesn't relabel an already-rolled total.
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
  // A crit inflates every damage die — the weapon/spell's own and any
  // extra-damage rider riding along (Sneak Attack, Divine Smite) alike.
  const crit: CritSpec | undefined =
    setCritical && critical
      ? { mode: criticalDamageMode, extraSets }
      : undefined;
  // Undefined for a cantrip/weapon, which go out at no slot level.
  const reportedLevel = spell && !isCantrip ? castLevel : undefined;
  const rollDamageEffect = () => {
    // Condition riders join here too (Magic Weapon's +1 folds through
    // applyTotalRiders like a feature's).
    const damageRiders = [
      ...applicableRiders(ridersFor(character, "damage"), context),
      ...applicableRiders(critDiceRiders(character), context),
      ...conditionRiders(selfConditions, "damage"),
      ...ridersAgainst(target?.conditions ?? [], selfId, "damage"),
    ];
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
    // A landed extra may carry a condition (Fire Rune's Restrained), resolved
    // only from extras that actually rolled. First one wins if several.
    const granted = resolution.extras
      .map((e) => extras.find((x) => x.source === e.source)?.rider.applies)
      .find(Boolean);
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
      ...(granted
        ? {
            condition: {
              name: granted.name,
              ...(granted.rounds !== undefined
                ? { rounds: granted.rounds }
                : {}),
            },
          }
        : {}),
    });
  };
  // Explicit one-time commit, mirroring the hit-die apply.
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
      {/* span, not label: a label wrapping this Select forwards no click. */}
      {spell && mechanics && !isCantrip && !noSlots && (
        <span className="row roll-level-select">
          Cast at:{" "}
          <Select
            label="Cast at which slot level"
            value={String(castLevel)}
            options={availableLevels.map((lvl) => ({
              value: String(lvl),
              label: `${ordinalSlot(lvl)} level`,
            }))}
            onChange={(value) => setSlotLevel(Number(value))}
          />
        </span>
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
          {/* Manual mode: extras become reminders, not checkboxes — the entered total is authoritative. */}
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
                            <span className="row roll-extra-toggle">
                              Slot:{" "}
                              <Select
                                label="Which slot to burn on the smite"
                                value={String(effSmiteLevel)}
                                options={smiteLevels.map((l) => ({
                                  value: String(l),
                                  label: `${ordinalSlot(l)} level`,
                                }))}
                                onChange={(value) =>
                                  setSmiteLevel(Number(value))
                                }
                              />
                            </span>
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
                // Pool-powered extra (Fire Rune): checkbox labelled with pool
                // remaining; use is spent after the roll.
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
          {/* Manual mode: crit is a reminder text, not a checkbox — the entered total is authoritative. */}
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
              {/* The save roll happens elsewhere; this just reports both outcomes (5e rounds down on success). */}
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
              {/* Pool cost paid on its own button, so a re-roll is free. */}
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

// Spend a hit die: roll 1d<die>+CON, then apply heals HP (clamped to max,
// Durable minimum) and marks the die spent via the mechanics resolver.
function HitDieControls({
  character,
  die,
  onRolled,
}: {
  character: Character;
  die: HitDie;
  // Reported as it lands, like every other roll, so the DM's queue explains
  // the HP change the projection is about to show.
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
  // `gained` alone can't gate the button: a negative CON floors healing at 0,
  // but the die was still rolled and still needs spending.
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

// Death saving throw: flat d20, no modifiers/advantage (5e has none). Nat 1 =
// two failures, nat 20 = revive at 1 HP; applying is a separate press.
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
