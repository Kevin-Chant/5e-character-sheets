import { IClass } from "src/lib/types";

const ORDINAL_SUFFIXES = ["th", "st", "nd", "rd"];

export function ordinal(num: number) {
  const mod = num % 100;
  return (
    num +
    (ORDINAL_SUFFIXES[(mod - 20) % 10] ||
      ORDINAL_SUFFIXES[mod] ||
      ORDINAL_SUFFIXES[0])
  );
}

export function formatClass(klasses: IClass[]) {
  return klasses
    .map(
      (klass) =>
        `${ordinal(klass.level)} ${klass.name}` +
        (klass.subclass ? ` (${klass.subclass})` : ""),
    )
    .join(", ");
}
