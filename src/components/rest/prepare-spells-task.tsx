import { useState } from "react";
import classNames from "classnames";
import { UUID } from "crypto";
import { charPath, updateAt } from "src/lib/cursor";
import { FIELD, SpellLevelNum } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  classById,
  preparedSpellCount,
  preparedSpellsFor,
} from "src/lib/rules";
import { Spell } from "src/lib/types";
import { ordinal } from "src/lib/utils";

// A prepared caster's daily re-pick, inline. Deliberately NOT a second spell
// browser: it lists only the leveled spells this class already knows, with the
// same `prepared` toggle the spell list dispatches, so the rest panel and the
// sheet can't disagree. Existing picks are kept rather than cleared — by the
// book a long rest lets you *change* your prepared list, it doesn't wipe it.
export default function PrepareSpellsTask({
  classId,
  className,
}: {
  classId: UUID;
  className: string;
}) {
  const { character, dispatch } = useCharacter();
  const [expanded, setExpanded] = useState(false);

  if (!character) return <></>;
  const klass = classById(character, classId);
  const allowed = klass ? (preparedSpellCount(character, klass) ?? 0) : 0;
  const prepared = preparedSpellsFor(character, classId);
  const overPrepared = prepared > allowed;

  // Every leveled spell this class knows, with the bucket index each one needs
  // for its dispatch path.
  const spells = Object.entries(character.spells)
    .filter(([bucket]) => Number(bucket) > 0)
    .flatMap(([bucket, list]) =>
      (list ?? [])
        .map((spell, index) => ({ spell, index, level: Number(bucket) }))
        .filter(({ spell }) => spell.spellcastingClass === classId),
    )
    .sort((a, b) => a.level - b.level);

  const toggle = (level: number, index: number, next: boolean) =>
    dispatch(
      updateAt(
        charPath(FIELD.spells)
          .k(level as SpellLevelNum)
          .at(index)
          .k("prepared"),
        next,
      ),
    );

  return (
    <div className="rest-task">
      <div className="rest-task-head">
        <span className="rest-task-name">{className}</span>
        <div
          className="rest-meter"
          role="progressbar"
          aria-label={`${className} spells prepared`}
          aria-valuenow={prepared}
          aria-valuemin={0}
          aria-valuemax={allowed}
        >
          <div
            className="rest-meter-fill"
            style={{
              width: `${allowed > 0 ? Math.min(100, (prepared / allowed) * 100) : 0}%`,
            }}
          />
        </div>
        <span
          className={classNames("rest-task-count", {
            "is-over": overPrepared,
            "is-done": !overPrepared && prepared === allowed,
          })}
        >
          {prepared} of {allowed} prepared
        </span>
        <button
          type="button"
          className="btn-secondary rest-task-toggle"
          onClick={() => setExpanded((was) => !was)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide spells" : "Review"}
        </button>
      </div>

      {overPrepared && (
        <p className="rest-task-warning font-small">
          That&apos;s {prepared - allowed} more than {className} can prepare.
          Untick some to get back to {allowed}.
        </p>
      )}

      {expanded &&
        (spells.length === 0 ? (
          <p className="text-muted font-small rest-task-empty">
            No leveled spells on the sheet for {className} yet. Add some from
            the spellcasting section, then prepare them here.
          </p>
        ) : (
          <ul className="rest-spell-list">
            {spells.map(({ spell, index, level }) => (
              <li key={`${level}-${index}`}>
                <label className="rest-spell-row">
                  <input
                    type="checkbox"
                    checked={!!spell.prepared}
                    onChange={(e) => toggle(level, index, e.target.checked)}
                  />
                  <span className="rest-spell-name">{spellName(spell)}</span>
                  <span className="rest-spell-level text-muted font-small">
                    {ordinal(level)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

const spellName = (spell: Spell) => spell.info.title;
