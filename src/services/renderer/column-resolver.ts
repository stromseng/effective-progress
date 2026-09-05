import { resolveColumnSizeValue } from "../../columns";
import { defaults } from "../../columns";
import type { CellInfo, ColumnDef, TaskId } from "../../types";
import type { TaskRowModel } from "../store/types";

type PrepareFn = NonNullable<ColumnDef<any, any>["prepare"]>;

interface ResolvedColumnEntry {
  readonly column: ColumnDef<any, any>;
  readonly prepared: unknown;
}

export interface ResolvedColumnPosition {
  readonly index: number;
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly entries: ReadonlyArray<ResolvedColumnEntry | undefined>;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: number;
  readonly minWidth?: number;
}

const DEFAULT_COLUMNS = defaults();

const getColumnsForRow = (
  row: TaskRowModel,
  columns: ReadonlyMap<TaskId, ReadonlyArray<ColumnDef<any, any>>>,
): ReadonlyArray<ColumnDef<any, any>> => columns.get(row.task.id) ?? DEFAULT_COLUMNS;

const maxDefined = (values: ReadonlyArray<number | undefined>): number | undefined =>
  values.reduce<number | undefined>(
    (maxValue, value) =>
      value === undefined ? maxValue : Math.max(maxValue ?? Number.NEGATIVE_INFINITY, value),
    undefined,
  );

const resolvePreparedGroups = (
  defs: ReadonlyArray<ColumnDef<any, any> | undefined>,
  cellInfos: ReadonlyArray<CellInfo<unknown>>,
): ReadonlyMap<PrepareFn, unknown> => {
  const groupedRows = new Map<PrepareFn, CellInfo<any>[]>();

  defs.forEach((def, rowIndex) => {
    if (!def?.prepare) {
      return;
    }

    const key = def.prepare;
    const rows = groupedRows.get(key);
    const cell = cellInfos[rowIndex];
    if (!cell) {
      return;
    }

    if (rows) {
      rows.push(cell);
    } else {
      groupedRows.set(key, [cell]);
    }
  });

  const groups = new Map<PrepareFn, unknown>();

  for (const [key, rows] of groupedRows) {
    groups.set(key, key(rows));
  }

  return groups;
};

export const resolveColumns = (
  rows: ReadonlyArray<TaskRowModel>,
  columns: ReadonlyMap<TaskId, ReadonlyArray<ColumnDef<any, any>>>,
): ReadonlyArray<ResolvedColumnPosition> => {
  const columnsByRow = rows.map((row) => getColumnsForRow(row, columns));
  const maxColumnCount = columnsByRow.reduce((max, defs) => Math.max(max, defs.length), 0);

  return Array.from({ length: maxColumnCount }, (_, index) => {
    const defsAtIndex = columnsByRow.map((defs) => defs[index]);
    const preparedGroups = resolvePreparedGroups(defsAtIndex, rows);
    const entries = defsAtIndex.map((column) =>
      column === undefined
        ? undefined
        : {
            column,
            prepared: column.prepare === undefined ? undefined : preparedGroups.get(column.prepare),
          },
    );

    const resolveSize = (key: "flexGrow" | "flexShrink" | "flexBasis" | "minWidth") =>
      maxDefined(
        entries.map((entry) =>
          entry === undefined
            ? undefined
            : resolveColumnSizeValue(entry.column[key], entry.prepared),
        ),
      );

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
