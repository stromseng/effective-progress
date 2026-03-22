import type { ColumnDef, ColumnSizeValue } from "./types";
import {
  AmountCell,
  measureAmountLayout,
  type AmountLayout,
} from "./renderer/columns/amount-column";
import { BarCell, prepareBar, type BarPrepared } from "./renderer/columns/bar-column";
import {
  DescriptionCell,
  prepareDescription,
  type DescriptionPrepared,
} from "./renderer/columns/description-column";
import { ElapsedCell } from "./renderer/columns/elapsed-column";
import { EtaCell } from "./renderer/columns/eta-column";

export type { AmountLayout, BarPrepared, DescriptionPrepared };

export interface SpacerOptions {
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly minWidth?: number;
}

export const spacer = <M = unknown>({
  flexGrow,
  flexShrink,
  flexBasis,
  minWidth,
}: SpacerOptions = {}): ColumnDef<M> => ({
  render: () => null,
  flexGrow,
  flexShrink,
  flexBasis,
  minWidth,
});

export const description = (): ColumnDef<any, DescriptionPrepared> => ({
  prepare: prepareDescription,
  flexGrow: 1,
  flexShrink: 1,
  minWidth: 1,
  render: (cell, ctx) => (
    <DescriptionCell
      cell={cell}
      width={ctx.width}
      minTreeWidth={ctx.prepared.minTreeWidth}
      spinnerTick={ctx.spinnerTick}
    />
  ),
});

export const bar = (): ColumnDef<any, BarPrepared> => ({
  prepare: prepareBar,
  flexShrink: (prepared) => (prepared.hasDeterminateRows ? 1 : 0),
  flexBasis: (prepared) => (prepared.hasDeterminateRows ? 30 : 0),
  minWidth: (prepared) => (prepared.hasDeterminateRows ? 4 : 0),
  render: ({ task }, ctx) => <BarCell task={task} width={ctx.width} />,
});

export const amount = (): ColumnDef<any, AmountLayout> => ({
  prepare: measureAmountLayout,
  align: "right",
  render: ({ task }, ctx) => <AmountCell task={task} layout={ctx.prepared} />,
});

export const elapsed = (): ColumnDef<any> => ({
  align: "right",
  flexShrink: 0,
  render: ({ task }, ctx) => <ElapsedCell task={task} now={ctx.now} />,
});

export const eta = (): ColumnDef<any> => ({
  align: "right",
  flexShrink: 0,
  render: ({ task }, ctx) => <EtaCell task={task} now={ctx.now} />,
});

export const defaults = (): ReadonlyArray<ColumnDef<any, any>> => [
  description(),
  bar(),
  amount(),
  elapsed(),
  eta(),
];

export const resolveColumnSizeValue = <P,>(
  value: ColumnSizeValue<P> | undefined,
  prepared: P,
): number | undefined => {
  if (typeof value === "function") {
    return value(prepared);
  }

  return value;
};
