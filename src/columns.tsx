import type { ColumnDef, ColumnSizeValue } from "./types";
import {
  AmountCell,
  measureAmountLayout,
  type AmountLayout,
} from "./services/renderer/columns/amount-column";
import { BarCell, prepareBar, type BarPrepared } from "./services/renderer/columns/bar-column";
import {
  DescriptionCell,
  prepareDescription,
  type DescriptionPrepared,
} from "./services/renderer/columns/description-column";
import { ElapsedEtaCell } from "./services/renderer/columns/elapsed-eta-column";
import { ElapsedCell } from "./services/renderer/columns/elapsed-column";
import { EtaCell } from "./services/renderer/columns/eta-column";

export type { AmountLayout, BarPrepared, DescriptionPrepared };

export interface SpacerOptions {
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly minWidth?: number;
}

export interface BarOptions {
  readonly size?: number | "fullwidth";
}

const DEFAULT_BAR_SIZE = 30;

const resolveBarSize = (size: number | "fullwidth" | undefined): number | "fullwidth" => {
  if (size === "fullwidth") {
    return size;
  }

  if (typeof size !== "number" || !Number.isFinite(size)) {
    return DEFAULT_BAR_SIZE;
  }

  return Math.max(1, Math.floor(size));
};

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
  flexShrink: 1,
  flexBasis: (prepared) => prepared.preferredWidth,
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

export const bar = ({ size }: BarOptions = {}): ColumnDef<any, BarPrepared> => {
  const resolvedSize = resolveBarSize(size);

  return {
    prepare: prepareBar,
    flexGrow: (prepared) => (prepared.hasDeterminateRows && resolvedSize === "fullwidth" ? 1 : 0),
    flexShrink: (prepared) => (prepared.hasDeterminateRows ? 1 : 0),
    flexBasis: (prepared) =>
      prepared.hasDeterminateRows
        ? resolvedSize === "fullwidth"
          ? DEFAULT_BAR_SIZE
          : resolvedSize
        : 0,
    minWidth: (prepared) =>
      prepared.hasDeterminateRows ? (resolvedSize === "fullwidth" ? 4 : resolvedSize) : 0,
    render: ({ task }, ctx) => <BarCell task={task} width={ctx.width} />,
  };
};

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

export const elapsedEta = (): ColumnDef<any> => ({
  align: "right",
  flexShrink: 0,
  minWidth: 11,
  render: ({ task }, ctx) => <ElapsedEtaCell task={task} now={ctx.now} />,
});

export const eta = (): ColumnDef<any> => ({
  align: "right",
  flexShrink: 0,
  minWidth: 8,
  render: ({ task }) => <EtaCell task={task} />,
});

export const defaults = (): ReadonlyArray<ColumnDef<any, any>> => [
  description(),
  bar(),
  amount(),
  elapsedEta(),
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
