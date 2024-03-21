interface OptionOrCustomValueProps {
  value: any;
  setValue: (newVal: any) => void;
  options: string[];
  customDefaultValue: any;
  customValueHelpText: string;
  customInputType: "number" | "text";
  allowUndefined?: boolean;
  undefinedHelpText?: string;
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
}: OptionOrCustomValueProps) {
  if (options.includes(value) || (value === "undefined" && allowUndefined)) {
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
        {options.map((option, i) => (
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
        <button onClick={() => setValue(options[0] || customDefaultValue)}>
          {undefinedHelpText}
        </button>
      </div>
    );
  }
  const transformValue =
    customInputType === "number" ? parseInt : (x: string) => x;
  return (
    <>
      <p>{customValueHelpText}</p>
      <input
        type={customInputType}
        min={0}
        value={value}
        onChange={(e) => setValue(transformValue(e.target.value))}
      ></input>
    </>
  );
}
