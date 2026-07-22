import { useState } from "react";
import { DamageType, StatKey } from "src/lib/data/data-definitions";
import { SpellMechanics, SpellResolution } from "src/lib/types";
import { UUID } from "crypto";
import {
  MechForm,
  ScalingForm,
  defaultMechanics,
  formToMechanics,
  mechanicsToForm,
} from "src/lib/spells/mechanics-form";

const DAMAGE_TYPES = Object.values(DamageType);
const STATS = Object.values(StatKey);
const ordinal = (n: number) =>
  `${n}${["th", "st", "nd", "rd"][n % 10 > 3 || (n >= 11 && n <= 13) ? 0 : n % 10]}`;

interface Props {
  mechanics?: SpellMechanics;
  // Base spell level, derived from where the spell sits (0 = cantrip).
  level: number;
  // The spell's current spellcasting class id — stamped into any "+ spell mod".
  spellcastingClass: UUID;
  onChange: (mechanics: SpellMechanics | undefined) => void;
}

// Structured-mechanics editor embedded in the spell modal. Lets a hand-authored
// spell declare how it resolves and what it rolls, so it gets a play-mode roll
// button (and level scaling) just like an imported SRD spell. See
// `.claude/docs/spell-scaling.md`.
export default function EditSpellMechanics({
  mechanics,
  level,
  spellcastingClass,
  onChange,
}: Props) {
  const [form, setForm] = useState<MechForm | null>(
    mechanics ? mechanicsToForm(mechanics) : null,
  );
  const isCantrip = level === 0;

  // Every edit funnels through here so the derived model stays in lock-step with
  // the form without a mount-time write.
  const apply = (next: MechForm | null) => {
    setForm(next);
    onChange(
      next ? formToMechanics(next, level, spellcastingClass) : undefined,
    );
  };

  const patch = (partial: Partial<MechForm>) =>
    form && apply({ ...form, ...partial });

  if (!form) {
    return (
      <fieldset className="spell-mechanics">
        <legend>Rolling</legend>
        <label className="spell-mechanics-enable">
          <input
            type="checkbox"
            checked={false}
            onChange={() => apply(mechanicsToForm(defaultMechanics(level)))}
          />{" "}
          This spell rolls damage or healing
        </label>
        <p className="font-small muted">
          Turn this on to give the spell a roll button in play mode.
        </p>
      </fieldset>
    );
  }

  const res = form.resolution;
  const setResolution = (resolution: SpellResolution) => patch({ resolution });
  const setResolutionKind = (kind: SpellResolution["kind"]) => {
    if (kind === "attack") setResolution({ kind: "attack", range: "ranged" });
    else if (kind === "save")
      setResolution({
        kind: "save",
        ability: StatKey.dex,
        halfOnSuccess: true,
      });
    else setResolution({ kind: "auto" });
  };

  const setDamageRow = (
    i: number,
    partial: Partial<MechForm["damage"][number]>,
  ) =>
    patch({
      damage: form.damage.map((r, j) => (j === i ? { ...r, ...partial } : r)),
    });

  const scaling = form.scaling;
  const patchScaling = (partial: Partial<ScalingForm>) =>
    scaling && patch({ scaling: { ...scaling, ...partial } });

  return (
    <fieldset className="spell-mechanics">
      <legend>Rolling</legend>
      <label className="spell-mechanics-enable">
        <input type="checkbox" checked onChange={() => apply(null)} /> This
        spell rolls damage or healing
      </label>
      <p className="font-small muted">
        Base level: {isCantrip ? "cantrip" : `${ordinal(level)} level`}
      </p>

      {/* Resolution */}
      <div className="spell-mechanics-controls">
        <label>
          How it hits
          <select
            value={res.kind}
            onChange={(e) =>
              setResolutionKind(e.target.value as SpellResolution["kind"])
            }
          >
            <option value="attack">Spell attack roll</option>
            <option value="save">Saving throw</option>
            <option value="auto">Automatic hit</option>
          </select>
        </label>
        {res.kind === "attack" && (
          <label>
            Attack range
            <select
              value={res.range}
              onChange={(e) =>
                setResolution({
                  kind: "attack",
                  range: e.target.value as "melee" | "ranged",
                })
              }
            >
              <option value="ranged">Ranged</option>
              <option value="melee">Melee</option>
            </select>
          </label>
        )}
        {res.kind === "save" && (
          <label>
            Save ability
            <select
              value={res.ability}
              onChange={(e) =>
                setResolution({ ...res, ability: e.target.value as StatKey })
              }
            >
              {STATS.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {res.kind === "save" && (
        <label className="spell-mechanics-check">
          <input
            type="checkbox"
            checked={!!res.halfOnSuccess}
            onChange={(e) =>
              setResolution({ ...res, halfOnSuccess: e.target.checked })
            }
          />
          Half damage on a successful save
        </label>
      )}

      {/* Damage */}
      <div className="spell-mechanics-block">
        <div className="row space-between">
          <strong>Damage</strong>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              patch({
                damage: [
                  ...form.damage,
                  {
                    damageType: DamageType.Fire,
                    dice: "1d6",
                    addSpellMod: false,
                  },
                ],
              });
            }}
          >
            Add damage type
          </button>
        </div>
        {form.damage.length === 0 && (
          <p className="font-small muted">
            No damage. Add a type or use healing.
          </p>
        )}
        {form.damage.map((row, i) => (
          <div className="spell-mechanics-row row" key={i}>
            {row.raw ? (
              <span className="font-small muted spell-mechanics-advanced">
                Advanced formula (kept as-is)
              </span>
            ) : (
              <>
                <input
                  type="text"
                  className="spell-mechanics-dice"
                  placeholder="e.g. 8d6"
                  value={row.dice}
                  onChange={(e) => setDamageRow(i, { dice: e.target.value })}
                />
                <label className="spell-mechanics-inline-check">
                  <input
                    type="checkbox"
                    checked={row.addSpellMod}
                    onChange={(e) =>
                      setDamageRow(i, { addSpellMod: e.target.checked })
                    }
                  />{" "}
                  + mod
                </label>
              </>
            )}
            <select
              value={row.damageType}
              onChange={(e) =>
                setDamageRow(i, { damageType: e.target.value as DamageType })
              }
            >
              {DAMAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Remove damage type"
              onClick={(e) => {
                e.preventDefault();
                patch({ damage: form.damage.filter((_, j) => j !== i) });
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>

      {/* Healing */}
      <div className="spell-mechanics-block">
        <strong>Healing</strong>
        {form.healing ? (
          <div className="spell-mechanics-row row">
            {form.healing.raw ? (
              <span className="font-small muted spell-mechanics-advanced">
                Advanced formula (kept as-is)
              </span>
            ) : (
              <>
                <input
                  type="text"
                  className="spell-mechanics-dice"
                  placeholder="e.g. 1d8"
                  value={form.healing.dice}
                  onChange={(e) =>
                    patch({
                      healing: { ...form.healing!, dice: e.target.value },
                    })
                  }
                />
                <label className="spell-mechanics-inline-check">
                  <input
                    type="checkbox"
                    checked={form.healing.addSpellMod}
                    onChange={(e) =>
                      patch({
                        healing: {
                          ...form.healing!,
                          addSpellMod: e.target.checked,
                        },
                      })
                    }
                  />{" "}
                  + mod
                </label>
              </>
            )}
            <button
              type="button"
              aria-label="Remove healing"
              onClick={(e) => {
                e.preventDefault();
                patch({ healing: undefined });
              }}
            >
              x
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              patch({ healing: { dice: "1d8", addSpellMod: true } });
            }}
          >
            Add healing
          </button>
        )}
      </div>

      {/* Separate rolls */}
      <label className="spell-mechanics-instances">
        Separate rolls
        <input
          type="number"
          min={1}
          value={form.instances}
          onChange={(e) =>
            patch({ instances: Math.max(1, parseInt(e.target.value) || 1) })
          }
        />
        <span className="font-small muted">
          Each rolled on its own — e.g. Magic Missile fires 3 darts, Scorching
          Ray 2 rays.
        </span>
      </label>

      {/* Higher-level scaling */}
      <details className="spell-mechanics-scaling" open={!!scaling}>
        <summary>Higher-level scaling</summary>
        <label className="spell-mechanics-enable">
          <input
            type="checkbox"
            checked={!!scaling}
            onChange={(e) =>
              patch({
                scaling: e.target.checked
                  ? {
                      driver: isCantrip ? "character" : "slot",
                      perLevels: 1,
                      damageDice: form.damage[0]?.dice || "1d6",
                      damageType: form.damage[0]?.damageType ?? DamageType.Fire,
                      instances: 0,
                    }
                  : undefined,
              })
            }
          />{" "}
          This spell grows when cast higher
        </label>
        {scaling && (
          <div className="spell-mechanics-growth">
            <div className="spell-mechanics-controls">
              <label>
                Grows with
                <select
                  value={scaling.driver}
                  onChange={(e) =>
                    patchScaling({
                      driver: e.target.value as "slot" | "character",
                    })
                  }
                >
                  <option value="slot">Spell slot level</option>
                  <option value="character">Character level (cantrips)</option>
                </select>
              </label>
            </div>
            {scaling.driver === "slot" && (
              <div className="spell-mechanics-field-inline">
                <span>Increase every</span>
                <input
                  type="number"
                  className="spell-mechanics-num"
                  min={1}
                  value={scaling.perLevels}
                  onChange={(e) =>
                    patchScaling({
                      perLevels: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                />
                <span>slot level{scaling.perLevels === 1 ? "" : "s"}</span>
              </div>
            )}
            <div className="spell-mechanics-field-inline">
              <span className="spell-mechanics-step-label">
                Extra damage per increase
              </span>
              <input
                type="text"
                className="spell-mechanics-dice"
                placeholder="e.g. 1d6"
                value={scaling.damageDice}
                onChange={(e) => patchScaling({ damageDice: e.target.value })}
              />
              <select
                value={scaling.damageType}
                onChange={(e) =>
                  patchScaling({ damageType: e.target.value as DamageType })
                }
              >
                {DAMAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="spell-mechanics-field-inline">
              <span className="spell-mechanics-step-label">
                Extra rolls per increase
              </span>
              <input
                type="number"
                className="spell-mechanics-num"
                min={0}
                value={scaling.instances}
                onChange={(e) =>
                  patchScaling({
                    instances: Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
              />
            </div>
            <p className="font-small muted">
              {scaling.driver === "character"
                ? "Cantrips grow at character levels 5, 11, and 17."
                : `Measured from ${ordinal(level)} level — the spell's own level.`}
            </p>
          </div>
        )}
      </details>
    </fieldset>
  );
}
