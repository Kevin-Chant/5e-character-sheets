import { useCharacter } from "src/lib/hooks/use-character";
import { CustomFormula, isCustomFormulaWithDamage } from "src/lib/types";
import {
  calculateCustomFormula,
  calculateCustomFormulaWithDamage,
  formatCustomFormula,
  formatCustomFormulaWithDamage,
} from "src/lib/utils";
import ComponentWithPopover from "./component-with-popover";

interface FormulaTextWithTooltipProps {
  calculatedValue: number | string;
  sourceFormula: string;
}

interface TextWithFormulasDisplayProps {
  templateString: string;
  formulas: CustomFormula[];
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
  formulas,
}: TextWithFormulasDisplayProps) {
  const { character } = useCharacter();
  if (!character) return <></>;
  const calculatedFormulas = formulas.map((formula) =>
    calculateCustomFormula(formula, character).toString()
  );
  const formattedFormulas = formulas.map((formula) =>
    formatCustomFormula(formula, character, false)
  );
  let i = 0;
  const stringSegments = templateString.split(/({{}})/).map((segment) => {
    const match = segment.match(/{{}}/);
    if (match) {
      const sourceFormula = formattedFormulas[i];
      const calculatedValue = calculatedFormulas[i];
      i++;
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
