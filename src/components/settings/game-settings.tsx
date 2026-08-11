import { useEncounter } from "src/lib/hooks/use-encounter";
import {
  SHARING_LABELS,
  SHARING_LEVELS,
  SharingLevel,
} from "src/lib/play/encounter";
import { useSettings } from "src/lib/hooks/use-settings";
import { RestVariant } from "src/lib/rest";
import { CritMode } from "src/lib/roll";
import SettingsSection from "./settings-section";
import Select from "src/components/select";

// House rules and table variants: how much bookkeeping the sheet does, how
// crits work, and what a rest gives back. Split out of General because these
// are the settings a group agrees on together, rather than per-device
// preferences like the theme or autosave.
export default function GameSettings() {
  const { settings, updateSetting } = useSettings();
  const {
    sessionStatus,
    hasDm,
    isDm,
    claimDm,
    canRun,
    sharing,
    setSharingLevel,
    hideDeathSaves,
    setDeathSavesHidden,
  } = useEncounter();
  const canTakeOver = sessionStatus === "connected" && hasDm && !isDm;
  // Whoever runs the table sets its policy — with no seat claimed that's
  // everybody, same as every other run-combat control.
  const canSetSharing = canRun;
  return (
    <div className="settings-sections">
      <SettingsSection
        title="Rest pacing"
        description="How long a rest takes. This changes only the durations the sheet quotes — what a rest restores is the same either way. Epic Heroism and Gritty Realism are the Dungeon Master's Guide variants for faster and slower campaigns."
      >
        {/* Every one of these settings names a variant and then explains it,
            so the explanation moves to its own line as a `hint` — the labels
            were single strings with an em dash doing the work of a layout. */}
        <span className="settings-select-inline">
          Rest lengths
          <Select
            label="Rest lengths"
            value={settings.restVariant}
            options={[
              // `meta`, not `hint`: the durations are what you compare the
              // three variants on, so they ride the trigger too rather than
              // living only inside the open list.
              {
                value: "standard",
                label: "Standard",
                meta: "1 hour / 8 hours (RAW)",
              },
              {
                value: "epic",
                label: "Epic Heroism",
                meta: "5 minutes / 1 hour",
              },
              {
                value: "gritty",
                label: "Gritty Realism",
                meta: "8 hours / 7 days",
              },
            ]}
            onChange={(value) =>
              updateSetting("restVariant", value as RestVariant)
            }
          />
        </span>
      </SettingsSection>

      <SettingsSection
        title="Long rest recovery"
        description="What a long rest gives back. The defaults are by the book; the alternatives cover the variants and house rules tables most often use."
      >
        <span className="settings-select-inline">
          Hit dice regained
          <Select
            label="Hit dice regained"
            value={settings.longRestHitDiceRecovery}
            options={[
              { value: "half", label: "Half your total, minimum one (RAW)" },
              { value: "all", label: "All spent hit dice" },
              { value: "none", label: "None" },
            ]}
            onChange={(value) =>
              updateSetting(
                "longRestHitDiceRecovery",
                value as "half" | "all" | "none",
              )
            }
          />
        </span>
        <span className="settings-select-inline">
          Hit points regained
          <Select
            label="Hit points regained"
            value={settings.longRestHpRecovery}
            options={[
              { value: "full", label: "All hit points (RAW)" },
              {
                value: "none",
                label: "None",
                hint: "Slow natural healing — spend hit dice instead",
              },
            ]}
            onChange={(value) =>
              updateSetting("longRestHpRecovery", value as "full" | "none")
            }
          />
        </span>
        <span className="settings-select-inline">
          Exhaustion removed
          <Select
            label="Exhaustion removed"
            value={settings.longRestExhaustionRecovery}
            options={[
              { value: "one", label: "One level (RAW)" },
              { value: "all", label: "Every level" },
              { value: "none", label: "None" },
            ]}
            onChange={(value) =>
              updateSetting(
                "longRestExhaustionRecovery",
                value as "one" | "all" | "none",
              )
            }
          />
        </span>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.longRestClearsTempHp}
            onChange={(e) =>
              updateSetting("longRestClearsTempHp", e.target.checked)
            }
          />
          Temporary hit points expire at the end of a long rest
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.promptSpellPreparation}
            onChange={(e) =>
              updateSetting("promptSpellPreparation", e.target.checked)
            }
          />
          Prompt prepared casters to re-pick their prepared spells
        </label>
      </SettingsSection>

      <SettingsSection
        title="Personality"
        description="Keep personality traits, ideals, bonds and flaws on the sheet, and ask for them when creating a character. Turn off if your table handles characterisation away from the sheet — anything already written is kept, just not shown."
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.trackPersonality}
            onChange={(e) =>
              updateSetting("trackPersonality", e.target.checked)
            }
          />
          Use personality traits, ideals, bonds and flaws
        </label>
      </SettingsSection>

      <SettingsSection
        title="Ammunition tracking"
        description="Track ammunition (arrows, bolts, …) as counted pools in Equipment, with a remaining count shown next to each ranged weapon. Turn off if your table doesn't bother counting ammo."
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.trackAmmunition}
            onChange={(e) => updateSetting("trackAmmunition", e.target.checked)}
          />
          Track ammunition
        </label>
      </SettingsSection>

      <SettingsSection
        title="Encumbrance tracking"
        description="Track equipment weight against your carrying capacity (Strength × 15 lb), with per-item weights and a total shown in Equipment. Turn off if your table ignores encumbrance."
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.trackEncumbrance}
            onChange={(e) =>
              updateSetting("trackEncumbrance", e.target.checked)
            }
          />
          Track encumbrance
        </label>
        <span className="settings-select-inline">
          Weight unit
          <Select
            label="Weight unit"
            value={settings.weightUnit}
            disabled={!settings.trackEncumbrance}
            options={[
              { value: "lb", label: "Pounds (lb)" },
              { value: "kg", label: "Kilograms (kg)" },
            ]}
            onChange={(value) =>
              updateSetting("weightUnit", value as "lb" | "kg")
            }
          />
        </span>
      </SettingsSection>

      <SettingsSection
        title="Criticals on all rolls"
        description="Show a natural 1 or 20 as “Critical Fail”/“Critical Success” on every d20 check, not just attack rolls. Attack to-hit rolls always show criticals (as “Critical Fail”/“Critical Hit”) regardless of this setting."
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.criticalsOnAllRolls}
            onChange={(e) =>
              updateSetting("criticalsOnAllRolls", e.target.checked)
            }
          />
          Show criticals on all d20 checks
        </label>
      </SettingsSection>

      <SettingsSection
        title="Critical hit damage"
        description="How a critical hit inflates damage. Crits are one of the most commonly house-ruled parts of 5e, so pick whichever flavor your table uses — it applies to weapon and spell damage alike, including riders like Sneak Attack and Divine Smite."
      >
        <span className="settings-select-inline">
          On a critical hit
          <Select
            label="On a critical hit"
            value={settings.criticalDamageMode}
            options={[
              { value: "raw", label: "Double the damage dice (RAW)" },
              { value: "maxDice", label: "Maximize the dice, then roll again" },
              { value: "total", label: "Double the total, modifiers included" },
            ]}
            onChange={(value) =>
              updateSetting("criticalDamageMode", value as CritMode)
            }
          />
        </span>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.explodingCriticals}
            onChange={(e) =>
              updateSetting("explodingCriticals", e.target.checked)
            }
          />
          Exploding crits — reroll the d20 after a crit; each repeat stacks
          another set of critical dice
        </label>
      </SettingsSection>

      {/* Table policy, not browser preference: this edits the *encounter*, so
          it syncs to every client, and it only renders for whoever runs the
          table. Mirrored on the DM board, where the mid-session "let's tighten
          this" moment actually happens. */}
      {canSetSharing && (
        <SettingsSection
          title="What players see"
          description="How much of the table's health the players see of each other and the monsters. The DM's own board always shows the numbers."
        >
          <Select
            label="What players see of the table's health"
            value={sharing}
            options={SHARING_LEVELS.map((level) => ({
              value: level,
              label: SHARING_LABELS[level],
            }))}
            onChange={(level) => setSharingLevel(level as SharingLevel)}
          />
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={!hideDeathSaves}
              onChange={(e) => setDeathSavesHidden(!e.target.checked)}
            />
            The party sees each other&apos;s death saving throws (the DM always
            does)
          </label>
        </SettingsSection>
      )}

      {/* The escape hatch for a DM who is genuinely never coming back. It lives
          here rather than on the session bar deliberately: starting a game
          claims the seat and a reload reclaims it, so the two everyday reasons
          to press this are gone, and a button on the bar would read like
          something to compete over at the start of every session. */}
      {canTakeOver && (
        <SettingsSection
          title="Take over the DM seat"
          description="Someone else is running combat in your session. The seat comes back to them on its own after a refresh or a dropped connection, so only use this if their browser is gone for good."
        >
          <button type="button" onClick={claimDm}>
            Take over as DM
          </button>
        </SettingsSection>
      )}
    </div>
  );
}
