import React, { useState } from "react";
import { GroupedOptionsList, OptionsList } from "src/lib/types";

interface OptionOrCustomValueProps {
  value: any;
  setValue: (newVal: any) => void;
  options: OptionsList;
  customDefaultValue: any;
  customValueHelpText: string;
  customInputType: "number" | "text";
  allowUndefined?: boolean;
  undefinedHelpText?: string;
  autoFocus?: boolean;
}

// Normalize either list shape into groups; a flat list becomes a single
// label-less group so rendering can treat both uniformly.
function toGroups(options: OptionsList): GroupedOptionsList {
  if (options.length === 0) return [];
  return typeof options[0] === "string"
    ? [{ label: "", options: options as string[] }]
    : (options as GroupedOptionsList);
}

// Text values get a typeahead combobox: free text that doubles as a filter over
// the known options, which are listed (grouped by their shared label) for quick
// selection while still accepting arbitrary custom input.
function Typeahead({
  value,
  setValue,
  groups,
  flat,
  customDefaultValue,
  customValueHelpText,
  allowUndefined,
  undefinedHelpText,
  autoFocus,
}: {
  groups: GroupedOptionsList;
  flat: string[];
} & Omit<OptionOrCustomValueProps, "options" | "customInputType">) {
  const [query, setQuery] = useState<string>(
    value == null ? "" : String(value),
  );
  const [open, setOpen] = useState(!!autoFocus);

  if (allowUndefined && value === undefined) {
    return (
      <div className="row">
        <button onClick={() => setValue(flat[0] || customDefaultValue)}>
          {undefinedHelpText}
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = groups
    .map((group) => ({
      label: group.label,
      options: group.options.filter((o) => o.toLowerCase().includes(q)),
    }))
    .filter((group) => group.options.length > 0);

  return (
    <div className="typeahead">
      <input
        type="text"
        autoFocus={autoFocus}
        placeholder={customValueHelpText}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setValue(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && filtered.length > 0 && (
        <ul className="typeahead-list rounded-border-box">
          {filtered.map((group) => (
            <li key={group.label} className="typeahead-group">
              {group.label && (
                <span className="typeahead-group-label">{group.label}</span>
              )}
              <ul>
                {group.options.map((option) => (
                  <li key={option}>
                    <button
                      className="typeahead-option"
                      // Keep the input focused so onClick fires before onBlur.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setValue(option);
                        setQuery(option);
                        setOpen(false);
                      }}
                    >
                      {option}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OptionOrCustomValue({
  value,
  setValue,
  options,
  customDefaultValue,
  customValueHelpText,
  customInputType,
  allowUndefined,
  undefinedHelpText,
  autoFocus,
}: OptionOrCustomValueProps) {
  const groups = toGroups(options);
  const flat = groups.flatMap((group) => group.options);

  if (customInputType === "text") {
    return (
      <Typeahead
        value={value}
        setValue={setValue}
        groups={groups}
        flat={flat}
        customDefaultValue={customDefaultValue}
        customValueHelpText={customValueHelpText}
        allowUndefined={allowUndefined}
        undefinedHelpText={undefinedHelpText}
        autoFocus={autoFocus}
      />
    );
  }

  // Numeric values keep the simple dropdown + custom-number entry.
  if (flat.includes(value) || (value === "undefined" && allowUndefined)) {
    return (
      <select
        className="font-large"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          if (e.target.value === "custom") {
            setValue(customDefaultValue);
          } else if (e.target.value === "undefined") {
            setValue(undefined);
          } else {
            setValue(e.target.value);
          }
        }}
      >
        {flat.map((option, i) => (
          <option key={i} value={option}>
            {option}
          </option>
        ))}
        <option value="custom">Other</option>
        {allowUndefined && <option value={"undefined"}>None</option>}
      </select>
    );
  }
  if (allowUndefined && value === undefined) {
    return (
      <div className="row">
        <button onClick={() => setValue(flat[0] || customDefaultValue)}>
          {undefinedHelpText}
        </button>
      </div>
    );
  }
  return (
    <>
      <p>{customValueHelpText}</p>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value))}
      ></input>
    </>
  );
}
