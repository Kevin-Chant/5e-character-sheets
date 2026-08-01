import {
  every,
  isArray,
  isNumber,
  isObject,
  isString,
  isUndefined,
} from "lodash";
import { UUID } from "crypto";
import {
  DamageType,
  DieOperation,
  OfficialClass,
  Operation,
  PB,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import {
  ArbitraryOperandOperation,
  AtomicVariable,
  ClassLevel,
  ClassName,
  CustomFormula,
  CustomFormulaWithDamage,
  DieDefinition,
  DieExpression,
  DoubleOperandOperation,
  EquippedArmor,
  Expression,
  NonStandardDie,
  SingleOperandOperation,
  SpellMod,
} from "src/lib/types/formula";
import {
  LimitedUseAbility,
  RechargeCriteria,
  TextComponent,
  TextComponentWithDetails,
  TextComponentWithoutDetails,
} from "src/lib/types/character";

// Runtime typeguards for the model above. Split out because they're the *only*
// executable code in the type layer — everything else here is erased at compile
// time, and mixing the two made `types.ts` look far bigger than the model is.

export function isUuid(data: any): data is UUID {
  return (
    typeof data === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)
  );
}
export function isArr<T>(
  data: any,
  validator: (data: any) => data is T,
): data is Array<T> {
  if (!Array.isArray(data)) return false;
  return every(data, validator);
}

export function isMap<K extends string | number | symbol, V>(
  data: any,
  kValidator: (data: any) => data is K,
  vValidator: (data: any) => data is V,
): data is Record<K, V> {
  // Arrays are lodash "objects" whose keys (indices) would pass numeric key
  // validators, so reject them explicitly.
  return (
    isObject(data) &&
    !isArray(data) &&
    every(Object.keys(data), kValidator) &&
    every(Object.values(data), vValidator)
  );
}

export function isTextComponent(data: any): data is TextComponent {
  return isTextComponentWithDetail(data) || isTextComponentWithoutDetail(data);
}

export function isTextComponentWithoutDetail(
  data: any,
): data is TextComponentWithoutDetails {
  return (
    typeof data === "object" &&
    typeof data.title === "string" &&
    isArray(data.titleFormulas) &&
    typeof data.detail === "undefined" &&
    typeof data.detailFormulas === "undefined"
  );
}

export function isTextComponentWithDetail(
  data: any,
): data is TextComponentWithDetails {
  return (
    typeof data === "object" &&
    typeof data.title === "string" &&
    isArray(data.titleFormulas) &&
    typeof data.detail === "string" &&
    isArray(data.detailFormulas)
  );
}

export function isStatKey(data: any): data is StatKey {
  return Object.keys(StatKey).includes(data);
}

export function isStandardDie(data: any): data is StandardDie {
  return Object.keys(StandardDie).includes(data);
}

export function isNonStandardDie(data: any): data is NonStandardDie {
  return typeof data === "object" && isNumber(data.numFaces);
}

export function isDieDefinition(data: any): data is DieDefinition {
  return isStandardDie(data) || isNonStandardDie(data);
}

export function isDieOperation(data: any): data is DieOperation {
  return isEnumMember<DieOperation>(data, DieOperation);
}

export function isDieExpression(data: any): data is DieExpression {
  return (
    isArray(data) &&
    isNumber(data[0]) &&
    isDieDefinition(data[1]) &&
    isDieOperation(data[2])
  );
}

export function isPb(data: any): data is typeof PB {
  return data === "proficiencyBonus";
}

export function isOfficialClass(data: any): data is OfficialClass {
  return Object.keys(OfficialClass).includes(data);
}

export function isClassName(data: any): data is ClassName {
  return isOfficialClass(data) || isString(data);
}

export function isEnumMember<T>(data: any, enumKlass: object): data is T {
  return Object.keys(enumKlass).includes(data);
}

export function isDamageType(data: any): data is DamageType {
  return Object.keys(DamageType).includes(data);
}

export function isCustomFormulaWithDamage(
  data: any,
): data is CustomFormulaWithDamage {
  return isMap<DamageType, CustomFormula>(data, isDamageType, isCustomFormula);
}

// Both class-referencing formula leaves are tagged objects carrying a class
// *id* (a UUID), never a bare string — so a class rename can't orphan them and
// they're unambiguous among atomic variables (a bare string used to be misread
// as a class name, which made *any* string a valid atomic).
export function isSpellMod(data: any): data is SpellMod {
  return isObject(data) && !isArray(data) && isUuid((data as any).spellMod);
}

export function isClassLevel(data: any): data is ClassLevel {
  return isObject(data) && !isArray(data) && isUuid((data as any).classLevel);
}

export function isEquippedArmor(data: any): data is EquippedArmor {
  return (
    isObject(data) && !isArray(data) && (data as any).equippedArmor === true
  );
}

export function isAtomicVariable(data: any): data is AtomicVariable {
  return (
    isNumber(data) ||
    isStatKey(data) ||
    isDieExpression(data) ||
    isPb(data) ||
    isSpellMod(data) ||
    isClassLevel(data) ||
    isEquippedArmor(data)
  );
}

export function isSingleOperandOperation(
  data: any,
): data is SingleOperandOperation {
  return (
    isObject(data) &&
    Object.keys(Operation).includes((data as any).operation) &&
    isCustomFormula((data as any).operand1) &&
    isUndefined((data as any).operand2)
  );
}

export function isDoubleOperandOperation(
  data: any,
): data is DoubleOperandOperation {
  return (
    isObject(data) &&
    Object.keys(Operation).includes((data as any).operation) &&
    isCustomFormula((data as any).operand1) &&
    isCustomFormula((data as any).operand2)
  );
}

export function isArbitraryOperandOperation(
  data: any,
): data is ArbitraryOperandOperation {
  return (
    isObject(data) &&
    Object.keys(Operation).includes((data as any).operation) &&
    isArray((data as any).operands) &&
    every((data as any).operands, (operand) => isCustomFormula(operand))
  );
}

export function isExpression(data: any): data is Expression {
  if (isDoubleOperandOperation(data))
    return isCustomFormula(data.operand1) && isCustomFormula(data.operand2);
  if (isSingleOperandOperation(data)) return isCustomFormula(data.operand1);
  if (isArbitraryOperandOperation(data))
    return every(data.operands, (operand) => isCustomFormula(operand));
  return false;
}

export function isCustomFormula(data: any): data is CustomFormula {
  return isAtomicVariable(data) || isExpression(data);
}

export function isRechargeCriteria(data: any): data is RechargeCriteria {
  return isString(data);
}

export function isLimitedUseAbility(data: any): data is LimitedUseAbility {
  return (
    isObject(data) &&
    isTextComponent((data as any).info) &&
    isCustomFormula((data as any).maxUses) &&
    isRechargeCriteria((data as any).recharge) &&
    ((data as any).restore === undefined ||
      isCustomFormula((data as any).restore)) &&
    isNumber((data as any).expended)
  );
}
