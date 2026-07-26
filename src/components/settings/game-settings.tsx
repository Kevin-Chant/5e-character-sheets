import { useEncounter } from "src/lib/hooks/use-encounter";
import { useSettings } from "src/lib/hooks/use-settings";
import { RestVariant } from "src/lib/rest";
import { CritMode } from "src/lib/roll";
import SettingsSection from "./settings-section";

// House rules and table variants: how much bookkeeping the sheet does, how
// crits work, and what a rest gives back. Split out of General because these
// are the settings a group agrees on together, rather than per-device
// preferences like the theme or autosave.
export default function GameSettings() {
  const { settings, updateSetting } = useSettings();
  const { sessionStatus, hasDm, isDm, claimDm } = useEncounter();
  const canTakeOver = sessionStatus === "connected" && hasDm && !isDm;
  return (
    <div className="settings-sections">
      <SettingsSection
        title="Rest pacing"
        description="How long a rest takes. This changes only the durations the sheet quotes — what a rest restores is the same either way. Epic Heroism and Gritty Realism are the Dungeon Master's Guide variants for faster and slower campaigns."
      >
        <label className="settings-select-inline">
          Rest lengths
          <select
            value={settings.restVariant}
            onChange={(e) =>
              updateSetting("restVariant", e.target.value as RestVariant)
            }
          >
            <option value="standard">Standard — 1 hour / 8 hours (RAW)</option>
            <option value="epic">Epic Heroism — 5 minutes / 1 hour</option>
            <option value="gritty">Gritty Realism — 8 hours / 7 days</option>
          </select>
        </label>
      </SettingsSection>

      <SettingsSection
        title="Long rest recovery"
        description="What a long rest gives back. The defaults are by the book; the alternatives cover the variants and house rules tables most often use."
      >
        <label className="settings-select-inline">
          Hit dice regained
          <select
            value={settings.longRestHitDiceRecovery}
            onChange={(e) =>
              updateSetting(
                "longRestHitDiceRecovery",
                e.target.value as "half" | "all" | "none",
              )
            }
          >
            <option value="half">Half your total, minimum one (RAW)</option>
            <option value="all">All spent hit dice</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="settings-select-inline">
          Hit points regained
          <select
            value={settings.longRestHpRecovery}
            onChange={(e) =>
              updateSetting(
                "longRestHpRecovery",
                e.target.value as "full" | "none",
              )
            }
          >
            <option value="full">All hit points (RAW)</option>
            <option value="none">
              None — slow natural healing, spend hit dice instead
            </option>
          </select>
        </label>
        <label className="settings-select-inline">
          Exhaustion removed
          <select
            value={settings.longRestExhaustionRecovery}
            onChange={(e) =>
              updateSetting(
                "longRestExhaustionRecovery",
                e.target.value as "one" | "all" | "none",
              )
            }
          >
            <option value="one">One level (RAW)</option>
            <option value="all">Every level</option>
            <option value="none">None</option>
          </select>
        </label>
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
        <label className="settings-select-inline">
          Weight unit
          <select
            value={settings.weightUnit}
            disabled={!settings.trackEncumbrance}
            onChange={(e) =>
              updateSetting("weightUnit", e.target.value as "lb" | "kg")
            }
          >
            <option value="lb">Pounds (lb)</option>
            <option value="kg">Kilograms (kg)</option>
          </select>
        </label>
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
        <label className="settings-select-inline">
          On a critical hit
          <select
            value={settings.criticalDamageMode}
            onChange={(e) =>
              updateSetting("criticalDamageMode", e.target.value as CritMode)
            }
          >
            <option value="raw">Double the damage dice (RAW)</option>
            <option value="maxDice">Maximize the dice, then roll again</option>
            <option value="total">Double the total, modifiers included</option>
          </select>
        </label>
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
