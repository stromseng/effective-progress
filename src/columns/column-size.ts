import { Predicate } from "effect";
import type { ColumnSizeValue } from "../types";

export const resolveColumnSizeValue = <P>(
  value: ColumnSizeValue<P> | undefined,
  prepared: P,
): number | undefined => {
  if (Predicate.isFunction(value)) {
    return value(prepared);
  }

  return value;
};
