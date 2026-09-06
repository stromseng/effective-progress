import { resolveColumnSizeValue } from "../../columns";
import type { CellInfo, Column, ColumnAlign, ColumnDef, ColumnRenderContext } from "../../types";
import type { ReactNode } from "react";

type PrepareFn = NonNullable<Column["prepare"]>;

/** Prepared values never leave this boundary independently of their definition. */
export interface ResolvedColumn {
  readonly render: (cell: CellInfo, ctx: Omit<ColumnRenderContext, "prepared">) => ReactNode;
  readonly align?: ColumnAlign;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly minWidth?: number;
}

const bindColumn = <P>(column: ColumnDef<unknown, P>, prepared: P): ResolvedColumn => ({
  render: (cell, ctx) => column.render(cell, { ...ctx, prepared }),
  align: column.align,
  flexGrow: resolveColumnSizeValue(column.flexGrow, prepared),
  flexShrink: resolveColumnSizeValue(column.flexShrink, prepared),
  flexBasis: resolveColumnSizeValue(column.flexBasis, prepared),
  minWidth: resolveColumnSizeValue(column.minWidth, prepared),
});

/** Groups by prepare identity at one position, then binds each result to its original definition. */
export const prepareColumns = (
  definitions: ReadonlyArray<Column | undefined>,
  cells: ReadonlyArray<CellInfo>,
): ReadonlyArray<ResolvedColumn | undefined> => {
  const groupedRows = new Map<PrepareFn, CellInfo[]>();
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
