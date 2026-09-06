import { defaults } from "../../columns";
import type { Column, TaskId } from "../../types";
import { prepareColumns, type ResolvedColumn } from "./column-runtime";
import type { TaskRowModel } from "../store/types";

export interface ResolvedColumnPosition {
  readonly index: number;
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly entries: ReadonlyArray<ResolvedColumn | undefined>;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly minWidth?: number;
}

const DEFAULT_COLUMNS = defaults();

const getColumnsForRow = (
  row: TaskRowModel,
  columns: ReadonlyMap<TaskId, ReadonlyArray<Column>>,
): ReadonlyArray<Column> => columns.get(row.task.id) ?? DEFAULT_COLUMNS;

const maxDefined = (values: ReadonlyArray<number | undefined>): number | undefined =>
  values.reduce<number | undefined>(
    (maxValue, value) =>
      value === undefined ? maxValue : Math.max(maxValue ?? Number.NEGATIVE_INFINITY, value),
    undefined,
  );

export const resolveColumns = (
  rows: ReadonlyArray<TaskRowModel>,
  columns: ReadonlyMap<TaskId, ReadonlyArray<Column>>,
): ReadonlyArray<ResolvedColumnPosition> => {
  const columnsByRow = rows.map((row) => getColumnsForRow(row, columns));
  const maxColumnCount = columnsByRow.reduce((max, defs) => Math.max(max, defs.length), 0);

  return Array.from({ length: maxColumnCount }, (_, index) => {
    const defsAtIndex = columnsByRow.map((defs) => defs[index]);
    const entries = prepareColumns(defsAtIndex, rows);

    const resolveSize = (key: "flexGrow" | "flexShrink" | "flexBasis" | "minWidth") =>
      maxDefined(entries.map((entry) => entry?.[key]));

    return {
      index,
      rows,
      entries,
      flexGrow: resolveSize("flexGrow"),
      flexShrink: resolveSize("flexShrink"),
      flexBasis: resolveSize("flexBasis"),
      minWidth: resolveSize("minWidth"),
    };
  });
};
