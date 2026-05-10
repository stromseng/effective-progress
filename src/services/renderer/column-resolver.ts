import { resolveColumnSizeValue } from "../../columns";
import { defaults } from "../../columns";
import type { CellInfo, ColumnDef, TaskId } from "../../types";
import type { TaskRowModel } from "../store/types";

const NO_PREPARE = Symbol("no-prepare");
type PrepareFn = NonNullable<ColumnDef<any, any>["prepare"]>;

interface PreparedGroup {
  readonly key: symbol | PrepareFn;
  readonly prepared: unknown;
}

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

const getColumnsForRow = (
  row: TaskRowModel,
  columns: Map<TaskId, ReadonlyArray<ColumnDef<any, any>>>,
): ReadonlyArray<ColumnDef<any, any>> => columns.get(row.task.id) ?? defaults();

const toCellInfo = (row: TaskRowModel): CellInfo<unknown> => row;

const maxDefined = (values: ReadonlyArray<number | undefined>): number | undefined =>
  values.reduce<number | undefined>(
    (maxValue, value) =>
      value === undefined ? maxValue : Math.max(maxValue ?? Number.NEGATIVE_INFINITY, value),
    undefined,
  );

const resolvePreparedGroups = (
  defs: ReadonlyArray<ColumnDef<any, any> | undefined>,
  cellInfos: ReadonlyArray<CellInfo<unknown>>,
): ReadonlyArray<PreparedGroup> => {
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

  const groups: PreparedGroup[] = [{ key: NO_PREPARE, prepared: undefined }];

  for (const [key, rows] of groupedRows) {
    groups.push({
      key,
      prepared: key(rows),
    });
  }

  return groups;
};

const getPreparedFor = (
  def: ColumnDef<any, any> | undefined,
  groups: ReadonlyArray<PreparedGroup>,
): unknown => {
  if (!def?.prepare) {
    return undefined;
  }

  return groups.find((group) => group.key === def.prepare)?.prepared;
};

export const resolveColumns = (
  rows: ReadonlyArray<TaskRowModel>,
  columns: Map<TaskId, ReadonlyArray<ColumnDef<any, any>>>,
): ReadonlyArray<ResolvedColumnPosition> => {
  const columnsByRow = rows.map((row) => getColumnsForRow(row, columns));
  const cellInfos = rows.map(toCellInfo);
  const maxColumnCount = columnsByRow.reduce((max, defs) => Math.max(max, defs.length), 0);

  return Array.from({ length: maxColumnCount }, (_, index) => {
    const defsAtIndex = columnsByRow.map((defs) => defs[index]);
    const preparedGroups = resolvePreparedGroups(defsAtIndex, cellInfos);
    const entries = defsAtIndex.map((column) =>
      column === undefined
        ? undefined
        : {
            column,
            prepared: getPreparedFor(column, preparedGroups),
          },
    );

    return {
      index,
      rows,
      entries,
      flexGrow: maxDefined(
        entries.map((entry) =>
          entry === undefined
            ? undefined
            : resolveColumnSizeValue(entry.column.flexGrow, entry.prepared),
        ),
      ),
      flexShrink: maxDefined(
        entries.map((entry) =>
          entry === undefined
            ? undefined
            : resolveColumnSizeValue(entry.column.flexShrink, entry.prepared),
        ),
      ),
      flexBasis: maxDefined(
        entries.map((entry) =>
          entry === undefined
            ? undefined
            : resolveColumnSizeValue(entry.column.flexBasis, entry.prepared),
        ),
      ),
      minWidth: maxDefined(
        entries.map((entry) =>
          entry === undefined
            ? undefined
            : resolveColumnSizeValue(entry.column.minWidth, entry.prepared),
        ),
      ),
    };
  });
};
