import { useEffect, useState } from "react";

interface InputFieldProps {
  type: "number" | "string";
  value: string;
  setValue: (newVal: string) => void;
}

export default function InputField({ type, value, setValue }: InputFieldProps) {
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div>
      <input
        className="margin-small"
        type={type}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
      />
      <button
        className="margin-small"
        disabled={localValue === value}
        onClick={() => setValue(localValue)}
      >
        Save
      </button>
    </div>
  );
}
