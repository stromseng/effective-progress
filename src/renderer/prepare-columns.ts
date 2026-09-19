import { Predicate } from "effect";
import type {
  TaskRow,
  AnyColumn,
  ColumnAlign,
  Column,
  CellContext,
  ColumnSizeValue,
} from "../columns/types";
import type { ReactNode } from "react";

type PrepareFn = NonNullable<AnyColumn["prepare"]>;

/** Prepared values never leave this boundary independently of their definition. */
export interface BoundColumn {
  readonly render: (row: TaskRow, ctx: Omit<CellContext, "prepared">) => ReactNode;
  readonly align?: ColumnAlign;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly minWidth?: number;
}

const resolveColumnSizeValue = <P>(
  value: ColumnSizeValue<P> | undefined,
  prepared: P,
): number | undefined => (Predicate.isFunction(value) ? value(prepared) : value);

const bindColumn = <P>(column: Column<unknown, P>, prepared: P): BoundColumn => ({
  render: (row, ctx) => column.render(row, { ...ctx, prepared }),
  align: column.align,
  flexGrow: resolveColumnSizeValue(column.flexGrow, prepared),
  flexShrink: resolveColumnSizeValue(column.flexShrink, prepared),
  flexBasis: resolveColumnSizeValue(column.flexBasis, prepared),
  minWidth: resolveColumnSizeValue(column.minWidth, prepared),
});

/** Groups by prepare identity at one position, then binds each result to its original definition. */
export const prepareColumns = (
  definitions: ReadonlyArray<AnyColumn | undefined>,
  cells: ReadonlyArray<TaskRow>,
): ReadonlyArray<BoundColumn | undefined> => {
  const groupedRows = new Map<PrepareFn, TaskRow[]>();
  definitions.forEach((column, index) => {
    if (!column?.prepare) {
      return;
    }
    const cell = cells[index];
    if (!cell) {
      return;
    }
    const group = groupedRows.get(column.prepare);
    if (group) {
      group.push(cell);
    } else {
      groupedRows.set(column.prepare, [cell]);
    }
  });
  const prepared = new Map<PrepareFn, unknown>();
  for (const [prepare, rows] of groupedRows) {
    prepared.set(prepare, prepare(rows));
  }
  return definitions.map((column) =>
    column === undefined
      ? undefined
      : bindColumn(column, column.prepare === undefined ? undefined : prepared.get(column.prepare)),
  );
};
