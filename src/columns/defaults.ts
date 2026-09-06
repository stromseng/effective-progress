import type { Column } from "./types";
import { description } from "./description";
import { bar } from "./bar";
import { amount } from "./amount";
import { elapsedEta } from "./elapsed-eta";

export const defaults = (): ReadonlyArray<Column> => [description(), bar(), amount(), elapsedEta()];
