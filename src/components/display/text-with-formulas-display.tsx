import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { CustomFormula } from "src/lib/types";
import { calculateCustomFormula, formatCustomFormula } from "src/lib/formula";
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
      ComponentType="span"
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
  const { character } = useLoadedCharacter();
  const calculatedFormulas = formulas.map((formula) =>
    calculateCustomFormula(formula, character).toString(),
  );
  const formattedFormulas = formulas.map((formula) =>
    formatCustomFormula(formula, character, false),
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

  // Span, not div: this renders a run of text and must stay inline (a block
  // would push a caller's adjacent content, e.g. a trailing comma, onto its own line).
  return (
    <span>
      {stringSegments.map((segment, i) => {
        if (typeof segment === "string") {
          return <span key={i}>{segment}</span>;
        } else {
          return <FormulaTextWithTooltip key={i} {...segment} />;
        }
      })}
    </span>
  );
}
