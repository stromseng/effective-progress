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
  const descriptionTree = DescriptionColumn(frame, { variant: "tree" });
  const descriptionPlain = DescriptionColumn(frame, { variant: "plain" });
  const descriptionCompact = DescriptionColumn(frame, { variant: "compact" });
  const descriptionSpinner = DescriptionColumn(frame, { variant: "spinner" });
  const progress = ProgressMetricsColumn(frame, { mode: "full" });
  const progressPercent = ProgressMetricsColumn(frame, { mode: "percent" });
  const eta = EtaColumn(frame);
  const columns: Array<StickyAwareColumn | undefined> = [
    {
      id: "description-tree",
      column: descriptionTree,
    },
    {
      id: "description-plain",
      column: descriptionPlain,
    },
    {
      id: "description-compact",
      column: descriptionCompact,
    },
    {
      id: "description-spinner",
      column: descriptionSpinner,
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
    unique(fromIds(["description-tree", "progress", "elapsed", "eta"])),
    unique(fromIds(["description-plain", "progress", "elapsed", "eta"])),
    unique(fromIds(["description-plain", "progress-percent", "elapsed", "eta"])),
    unique(fromIds(["description-plain", "progress-percent", "elapsed"])),
    unique(fromIds(["description-plain", "progress-percent"])),
    unique(fromIds(["description-compact", "progress-percent"])),
    unique(fromIds(["description-compact"])),
    unique(fromIds(["description-spinner"])),
  ].filter((columns) => columns.length > 0);
};

const minimumWidthForSet = (columns: ReadonlyArray<MeasuredColumn>): number =>
  visibleWidth(columns.map((column) => column.measure.min), ROOT_GAP);

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
    columnSets.find((columns) => minimumWidthForSet(columns) <= terminalColumns) ??
    columnSets.at(-1) ??
    []
  );
};

const preferredWidthsForSet = (columns: ReadonlyArray<MeasuredColumn>): Array<number> =>
  columns.map((column) => Math.max(column.measure.min, column.preferredWidth));

const reduceOverflowRichStyle = (
  widths: Array<number>,
  minimums: ReadonlyArray<number>,
  targetWidth: number,
): Array<number> => {
  let overflow = visibleWidth(widths, ROOT_GAP) - targetWidth;
  while (overflow > 0) {
    const widest = Math.max(
      ...widths.filter((width, index) => width > (minimums[index] ?? width)),
      -1,
    );
    if (widest < 0) {
      break;
    }

    const widestIndexes = widths
      .map((width, index) => ({ width, index }))
      .filter(({ width, index }) => width === widest && width > (minimums[index] ?? width))
      .map(({ index }) => index);
    if (widestIndexes.length === 0) {
      break;
    }

    for (const index of widestIndexes) {
      if (overflow <= 0) {
        break;
      }

      const minimum = minimums[index] ?? widths[index]!;
      if (widths[index]! <= minimum) {
        continue;
      }

      widths[index] = widths[index]! - 1;
      overflow -= 1;
    }
  }

  return widths;
};

const widthForSelectedSet = (
  columns: ReadonlyArray<MeasuredColumn>,
  targetWidth: number | undefined,
): Array<number> => {
  if (columns.length === 0) {
    return [];
  }

  if (targetWidth === undefined) {
    return preferredWidthsForSet(columns);
  }

  const minimums = columns.map((column) => column.measure.min);
  const widths = preferredWidthsForSet(columns);
  if (visibleWidth(widths, ROOT_GAP) <= targetWidth) {
    return widths;
  }

  return reduceOverflowRichStyle(widths, minimums, targetWidth);
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
    .map((width, index) => ({
      id: selectedColumns[index]!.id,
      width,
      render: selectedColumns[index]!.render,
    }))
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
