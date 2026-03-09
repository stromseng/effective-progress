import { Box } from "ink";
import type { ReactNode } from "react";
import type { TaskId } from "../../types";
import { DescriptionColumn } from "./description-column";
import { ElapsedColumn } from "./elapsed-column";
import { EtaColumn } from "./eta-column";
import type { Column, RenderFrameContextValue, WidthMeasure } from "./node";
import { ProgressMetricsColumn } from "./progress-metrics-column";
import type { TaskRowModel } from "../snapshot/types";
import { createRenderFrameContextValue } from "../view/frame-context";

const ROOT_GAP = 1;

const visibleWidth = (widths: ReadonlyArray<number>, gap: number): number => {
  const visible = widths.filter((width) => width > 0);
  return visible.reduce((sum, width) => sum + width, 0) + Math.max(0, visible.length - 1) * gap;
};

interface MeasuredColumn {
  readonly id: string;
  readonly measure: WidthMeasure;
  readonly preferredWidth: number;
  readonly render: (taskId: TaskId, width: number) => ReactNode;
}

export interface FlatColumnLayout {
  readonly id: string;
  readonly width: number;
  readonly render: (taskId: TaskId, width: number) => ReactNode;
}

export interface RootColumnInstance {
  render: () => ReactNode;
}

interface StickyAwareColumn {
  readonly id: string;
  readonly column: Column;
}

const buildColumns = (
  frame: RenderFrameContextValue,
  _stickyWidths: Map<string, number>,
): Map<string, StickyAwareColumn> => {
  const progress = ProgressMetricsColumn(frame, { mode: "full" });
  const progressPercent = ProgressMetricsColumn(frame, { mode: "percent" });
  const eta = EtaColumn(frame);
  const columns: Array<StickyAwareColumn | undefined> = [
    {
      id: "description",
      column: DescriptionColumn(frame),
    },
    progress === undefined
      ? undefined
      : {
          id: "progress",
          column: progress,
        },
    progressPercent === undefined
      ? undefined
      : {
          id: "progress-percent",
          column: progressPercent,
        },
    {
      id: "elapsed",
      column: ElapsedColumn(frame),
    },
    eta === undefined
      ? undefined
      : {
          id: "eta",
          column: eta,
        },
  ];

  return new Map(
    columns
      .filter((column): column is StickyAwareColumn => column !== undefined)
      .map((column) => [column.id, column] as const),
  );
};

const measureColumns = (
  columns: ReadonlyMap<string, StickyAwareColumn>,
): Map<string, MeasuredColumn> =>
  new Map(
    [...columns.values()].map((column) => {
      const measure = column.column.measure;
      return [
        column.id,
        {
          id: column.id,
          measure,
          preferredWidth: measure.preferred,
          render: column.column.render,
        } satisfies MeasuredColumn,
      ] as const;
    }),
  );

const rootColumnSets = (
  columnsById: ReadonlyMap<string, MeasuredColumn>,
): Array<Array<MeasuredColumn>> => {
  const fromIds = (ids: ReadonlyArray<string>): Array<MeasuredColumn> =>
    ids
      .map((id) => columnsById.get(id))
      .filter((column): column is MeasuredColumn => column !== undefined);

  const seen = new Set<string>();
  const unique = (columns: Array<MeasuredColumn>): Array<MeasuredColumn> => {
    const key = columns.map((column) => column.id).join(",");
    if (key.length === 0 || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return columns;
  };

  return [
    unique(fromIds(["description", "progress", "elapsed", "eta"])),
    unique(fromIds(["description", "progress-percent", "elapsed", "eta"])),
    unique(fromIds(["description", "progress-percent", "elapsed"])),
    unique(fromIds(["description", "progress-percent"])),
  ].filter((columns) => columns.length > 0);
};

const requiredWidthForSet = (columns: ReadonlyArray<MeasuredColumn>): number =>
  visibleWidth(
    columns.map((column, index) => (index === 0 ? column.measure.min : column.preferredWidth)),
    ROOT_GAP,
  );

const selectColumnSet = (
  columnSets: ReadonlyArray<ReadonlyArray<MeasuredColumn>>,
  terminalColumns: number | undefined,
): ReadonlyArray<MeasuredColumn> => {
  if (columnSets.length === 0) {
    return [];
  }

  if (terminalColumns === undefined) {
    return columnSets[0] ?? [];
  }

  return (
    columnSets.find((columns) => requiredWidthForSet(columns) <= terminalColumns) ??
    columnSets.at(-1) ??
    []
  );
};

const widthForSelectedSet = (
  columns: ReadonlyArray<MeasuredColumn>,
  targetWidth: number | undefined,
): Array<number> => {
  if (columns.length === 0) {
    return [];
  }

  if (targetWidth === undefined) {
    return columns.map((column) => column.preferredWidth);
  }

  const gapWidth = Math.max(0, columns.length - 1) * ROOT_GAP;
  const utilityColumns = columns.slice(1);
  const utilityWidth = utilityColumns.reduce((sum, column) => sum + column.preferredWidth, 0);
  const description = columns[0]!;
  const availableDescriptionWidth = Math.max(0, targetWidth - gapWidth - utilityWidth);
  const descriptionMax = description.measure.max ?? availableDescriptionWidth;
  const descriptionWidth = Math.min(availableDescriptionWidth, descriptionMax);

  return [descriptionWidth, ...utilityColumns.map((column) => column.preferredWidth)];
};

const emptyRootColumn = (stickyWidths: Map<string, number>): RootColumnInstance => {
  stickyWidths.clear();
  return {
    render: () => null,
  };
};

export const RootColumn = (
  rows: ReadonlyArray<TaskRowModel>,
  now: number,
  tick: number,
  terminalColumns: number | undefined,
  isTTY: boolean,
  stickyWidths: Map<string, number> = new Map(),
): RootColumnInstance => {
  if (rows.length === 0) {
    return emptyRootColumn(stickyWidths);
  }

  const frame = createRenderFrameContextValue(rows, now, tick, isTTY, stickyWidths);
  const columnsById = measureColumns(buildColumns(frame, stickyWidths));
  const selectedColumns = selectColumnSet(rootColumnSets(columnsById), terminalColumns);
  const targetWidth =
    terminalColumns === undefined
      ? visibleWidth(
          selectedColumns.map((column) => column.preferredWidth),
          ROOT_GAP,
        )
      : terminalColumns;
  const columns = widthForSelectedSet(selectedColumns, targetWidth)
    .map(
      (width, index): FlatColumnLayout => ({
        id: selectedColumns[index]!.id,
        width,
        render: selectedColumns[index]!.render,
      }),
    )
    .filter((column) => column.width > 0);

  const taskIds = rows.map((row) => row.task.id);
  const rowWidth = visibleWidth(
    columns.map((column) => column.width),
    ROOT_GAP,
  );

  return {
    render: () => (
      <Box flexDirection="row" minWidth={rowWidth}>
        {columns.map((column, index) => (
          <Box
            key={column.id}
            flexDirection="column"
            width={column.width}
            marginRight={index < columns.length - 1 ? ROOT_GAP : 0}
          >
            {taskIds.map((taskId) => (
              <Box key={taskId as number} width={column.width} height={1}>
                {column.render(taskId, column.width)}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    ),
  };
};
