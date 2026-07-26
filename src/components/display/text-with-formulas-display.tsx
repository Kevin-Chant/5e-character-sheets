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
      // Phrasing content, so it nests validly inside the run above and stays on
      // the same line as the words around it.
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

  // A span, not a div: this renders a *run of text*, and every one of its
  // segments is already inline. As a block it swallowed the whole line, so
  // anything a caller put next to it was pushed onto the next one — the Tools &
  // Other list's separating comma ended up orphaned on a line of its own, and
  // dragged the row's height with it. Nothing places this beside block content
  // that needed the break; where the parent is a flex container it becomes a
  // flex item exactly as the div did.
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
