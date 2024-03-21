import { useCharacter } from "src/lib/hooks/use-character";
import { isCustomFormulaWithDamage } from "src/lib/types";
import {
  calculateCustomFormula,
  calculateCustomFormulaWithDamage,
  formatCustomFormulaWithDamage,
  parseCustomFormula,
} from "src/lib/utils";
import ComponentWithPopover from "./component-with-popover";

interface FormulaTextWithTooltipProps {
  calculatedValue: number | string;
  sourceFormula: string;
}

interface TextWithFormulasDisplayProps {
  templateString: string;
}

function FormulaTextWithTooltip({
  calculatedValue,
  sourceFormula,
}: FormulaTextWithTooltipProps) {
  return (
    <ComponentWithPopover
      ComponentType="p"
      componentClass="pos-relative editable inline underline bold"
      componentChildren={<>{calculatedValue}</>}
      popoverClass="popover-container padding-medium rounded-border-box"
      popoverChildren={<>{sourceFormula}</>}
    />
  );
}

export default function TextWithFormulasDisplay({
  templateString,
}: TextWithFormulasDisplayProps) {
  const { character } = useCharacter();
  if (!character) return <></>;

  const stringSegments = templateString.split(/({{[^}]+}})/).map((segment) => {
    const match = segment.match(/{{([^}]+)}}/);
    if (match) {
      const sourceFormula = match[1];
      const parsedFormula = parseCustomFormula(sourceFormula);
      const calculatedValue = isCustomFormulaWithDamage(parsedFormula)
        ? formatCustomFormulaWithDamage(
            calculateCustomFormulaWithDamage(parsedFormula, character),
            character
          )
        : calculateCustomFormula(parsedFormula, character);
      return { calculatedValue, sourceFormula };
    } else {
      return segment;
    }
  });

  return (
    <div>
      {stringSegments.map((segment, i) => {
        if (typeof segment === "string") {
          return (
            <p className="inline" key={i}>
              {segment}
            </p>
          );
        } else {
          return <FormulaTextWithTooltip key={i} {...segment} />;
        }
      })}
    </div>
  );
}
