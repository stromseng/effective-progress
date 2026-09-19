import type { AnyColumn } from "./types";
import { description } from "./description";
import { bar } from "./bar";
import { amount } from "./amount";
import { elapsedEta } from "./elapsed-eta";

export const defaults = (): ReadonlyArray<AnyColumn> => [
  description(),
  bar(),
  amount(),
  elapsedEta(),
];
