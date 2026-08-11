import classNames from "classnames";
import {
  SHARING_DETAILS,
  SHARING_LABELS,
  SHARING_LEVELS,
  SharingLevel,
  TableDefaults,
} from "src/lib/play/encounter";

// The two policy controls a table runs on, shared by the settings tab (where
// they set the defaults a new game starts from) and the table panel (where
// they set this game). `defaults` turns on the inherit/override line: given,
// the values are a game's and can be sent back to the default; omitted, they
// are the default.
export default function TablePolicyFields({
  idPrefix,
  sharing,
  onSharing,
  hideDeathSaves,
  onHideDeathSaves,
  defaults,
}: {
  // Radio groups on two surfaces of one page would otherwise share a name.
  idPrefix: string;
  sharing: SharingLevel;
  onSharing: (level: SharingLevel) => void;
  hideDeathSaves: boolean;
  onHideDeathSaves: (hide: boolean) => void;
  defaults?: TableDefaults;
}) {
  const overridden =
    defaults !== undefined &&
    (defaults.sharing !== sharing ||
      defaults.hideDeathSaves !== hideDeathSaves);
  return (
    <div className="table-policy">
      {defaults !== undefined && (
        <p className={classNames("table-policy-source", { overridden })}>
          {overridden ? (
            <>
              <span>This game doesn&apos;t use your defaults.</span>
              <button
                type="button"
                onClick={() => {
                  onSharing(defaults.sharing);
                  onHideDeathSaves(defaults.hideDeathSaves);
                }}
              >
                Use my defaults
              </button>
            </>
          ) : (
            <span>Matching your defaults.</span>
          )}
        </p>
      )}
      <div className="table-policy-choices">
        {SHARING_LEVELS.map((level) => (
          <label
            key={level}
            className={classNames("table-policy-choice", {
              picked: sharing === level,
            })}
          >
            <input
              type="radio"
              name={`${idPrefix}-sharing`}
              checked={sharing === level}
              onChange={() => onSharing(level)}
            />
            <span>
              <b>{SHARING_LABELS[level]}</b>
              <span>{SHARING_DETAILS[level]}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={!hideDeathSaves}
          onChange={(e) => onHideDeathSaves(!e.target.checked)}
        />
        The party sees each other&apos;s death saving throws (the DM always
        does)
      </label>
    </div>
  );
}
