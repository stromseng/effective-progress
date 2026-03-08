import type { TaskRowModel } from "../snapshot/types";
import { createAmountColumnSpec } from "./amount-column";
import { createBarColumnSpec } from "./bar-column";
import { hasDeterminateRows } from "./determinate";
import { createDescriptionColumnSpec } from "./description-column";
import { createElapsedColumnSpec } from "./elapsed-column";
import { createEtaColumnSpec } from "./eta-column";
import { type ColumnPlan, type ColumnPlanningContext, planColumns } from "./planner";
import type { ColumnSpec } from "./spec";
import { resolveColumnSpecs } from "./spec";

/**
 * Frame planning algorithm (per render tick):
 *
 * 1. Ask each column module to produce a logical column spec (variants + measured widths).
 * 2. Apply shared resistance rules (shrink / demote / hide) to those variants.
 * 3. Feed resolved columns into `planColumns`.
 * 4. `planColumns` shrinks, demotes, and hides until the row fits target width.
 * 5. Render rows with the selected variant and width for each visible column.
 */
const BASELINE_ROW_WIDTH = 150;
const DEFAULT_RESISTANCE = 1_000;

interface VariantOrderItem {
  readonly columnId: string;
  readonly variantId: string;
}

const variantOrderKey = ({ columnId, variantId }: VariantOrderItem): string =>
  `${columnId}:${variantId}`;

// Lower index means "degrade earlier". Omitted variants keep DEFAULT_RESISTANCE.
const SHRINK_ORDER: ReadonlyArray<VariantOrderItem> = [
  { columnId: "eta", variantId: "prefixed" },
  { columnId: "elapsed", variantId: "stable" },
  { columnId: "eta", variantId: "duration" },
  { columnId: "eta", variantId: "primary" },
  { columnId: "bar", variantId: "compact" },
  { columnId: "bar", variantId: "full" },
  { columnId: "amount", variantId: "text" },
  { columnId: "elapsed", variantId: "compact" },
  { columnId: "description", variantId: "tree" },
  { columnId: "amount", variantId: "detailed" },
  { columnId: "amount", variantId: "processed" },
  { columnId: "description", variantId: "plain" },
];

const DEMOTE_ORDER: ReadonlyArray<VariantOrderItem> = [
  { columnId: "description", variantId: "tree" },
  { columnId: "eta", variantId: "prefixed" },
  { columnId: "eta", variantId: "duration" },
  { columnId: "elapsed", variantId: "stable" },
  { columnId: "bar", variantId: "full" },
  { columnId: "amount", variantId: "detailed" },
];

const HIDE_ORDER: ReadonlyArray<VariantOrderItem> = [
  { columnId: "eta", variantId: "primary" },
  { columnId: "eta", variantId: "prefixed" },
  { columnId: "eta", variantId: "duration" },
  { columnId: "bar", variantId: "full" },
  { columnId: "bar", variantId: "compact" },
  { columnId: "amount", variantId: "text" },
  { columnId: "amount", variantId: "detailed" },
  { columnId: "amount", variantId: "processed" },
];

const toResistanceLookup = (order: ReadonlyArray<VariantOrderItem>): ReadonlyMap<string, number> =>
  new Map(order.map((item, index) => [variantOrderKey(item), index + 1]));

const shrinkResistanceLookup = toResistanceLookup(SHRINK_ORDER);
const demoteResistanceLookup = toResistanceLookup(DEMOTE_ORDER);
const hideResistanceLookup = toResistanceLookup(HIDE_ORDER);

const resistanceFor = (
  lookup: ReadonlyMap<string, number>,
  columnId: string,
  variantId: string,
): number => lookup.get(`${columnId}:${variantId}`) ?? DEFAULT_RESISTANCE;

const buildColumns = (context: ColumnPlanningContext<TaskRowModel>, isTTY: boolean) => {
  const specs = [
    createDescriptionColumnSpec(context, isTTY),
    createBarColumnSpec(context, isTTY),
    createAmountColumnSpec(context),
    createElapsedColumnSpec(context, isTTY),
    createEtaColumnSpec(context, isTTY),
  ].filter((spec): spec is ColumnSpec<TaskRowModel> => spec !== undefined);

  return resolveColumnSpecs(specs, {
    shrink: (columnId, variantId) => resistanceFor(shrinkResistanceLookup, columnId, variantId),
    demote: (columnId, variantId) => resistanceFor(demoteResistanceLookup, columnId, variantId),
    hide: (columnId, variantId) => resistanceFor(hideResistanceLookup, columnId, variantId),
  });
};

export interface FrameLayout extends ColumnPlan<TaskRowModel> {}

export const computeFrameLayout = (
  rows: ReadonlyArray<TaskRowModel>,
  now: number,
  tick: number,
  terminalColumns: number | undefined,
  isTTY: boolean,
): FrameLayout => {
  const context: ColumnPlanningContext<TaskRowModel> = {
    rows,
    now,
    tick,
    terminalColumns,
  };

  return planColumns({
    context,
    columns: buildColumns(context, isTTY),
    baselineWidth: hasDeterminateRows(rows) ? BASELINE_ROW_WIDTH : 1,
  });
};
