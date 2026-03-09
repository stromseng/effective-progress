import { Box } from "ink";
import type { ReactNode } from "react";
import type { TaskId } from "../../types";
import { createRenderFrame } from "./frame";
import {
  DescriptionCompactRootColumn,
  DescriptionPlainRootColumn,
  DescriptionSpinnerRootColumn,
  DescriptionTreeRootColumn,
} from "./description-column";
import { ElapsedRootColumn } from "./elapsed-column";
import { EtaRootColumn } from "./eta-column";
import type { RenderFrameContextValue, RootColumnSpec, WidthMeasure } from "./node";
import { ProgressPercentRootColumn, ProgressRootColumn } from "./progress-metrics-column";
import type { TaskRowModel } from "../snapshot/types";

const ROOT_GAP = 1;

const visibleWidth = (widths: ReadonlyArray<number>, gap: number): number => {
  const visible = widths.filter((width) => width > 0);
  return visible.reduce((sum, width) => sum + width, 0) + Math.max(0, visible.length - 1) * gap;
};

interface MeasuredColumn {
  readonly spec: RootColumnSpec;
  readonly measure: WidthMeasure;
  readonly preferredWidth: number;
  readonly render: (taskId: TaskId, width: number) => ReactNode;
}

export interface RootColumnInstance {
  render: () => ReactNode;
}

interface StickyAwareColumn {
  readonly spec: RootColumnSpec;
  readonly column: NonNullable<ReturnType<RootColumnSpec["create"]>>;
}

export const ROOT_LAYOUTS = [
  [DescriptionTreeRootColumn, ProgressRootColumn, ElapsedRootColumn, EtaRootColumn],
  [DescriptionPlainRootColumn, ProgressRootColumn, ElapsedRootColumn, EtaRootColumn],
  [DescriptionPlainRootColumn, ProgressPercentRootColumn, ElapsedRootColumn, EtaRootColumn],
  [DescriptionPlainRootColumn, ProgressPercentRootColumn, ElapsedRootColumn],
  [DescriptionPlainRootColumn, ProgressPercentRootColumn],
  [DescriptionCompactRootColumn, ProgressPercentRootColumn],
  [DescriptionCompactRootColumn],
  [DescriptionSpinnerRootColumn],
] as const satisfies ReadonlyArray<ReadonlyArray<RootColumnSpec>>;

const ROOT_COLUMNS = [
  DescriptionTreeRootColumn,
  DescriptionPlainRootColumn,
  DescriptionCompactRootColumn,
  DescriptionSpinnerRootColumn,
  ProgressRootColumn,
  ProgressPercentRootColumn,
  ElapsedRootColumn,
  EtaRootColumn,
] as const satisfies ReadonlyArray<RootColumnSpec>;

const buildColumns = (frame: RenderFrameContextValue): Array<StickyAwareColumn> =>
  ROOT_COLUMNS.flatMap((spec) => {
    const column = spec.create(frame);
    return column === undefined ? [] : [{ spec, column }];
  });

const measureColumns = (
  columns: ReadonlyArray<StickyAwareColumn>,
): ReadonlyMap<RootColumnSpec, MeasuredColumn> =>
  new Map(
    columns.map(({ spec, column }) => {
      const measure = column.measure;
      return [
        spec,
        {
          spec,
          measure,
          preferredWidth: measure.preferred,
          render: column.render,
        } satisfies MeasuredColumn,
      ] as const;
    }),
  );

const resolveRootLayouts = (
  columnsBySpec: ReadonlyMap<RootColumnSpec, MeasuredColumn>,
): Array<Array<MeasuredColumn>> => {
  const resolveLayout = (specs: ReadonlyArray<RootColumnSpec>): Array<MeasuredColumn> =>
    [...specs]
      .map((spec) => columnsBySpec.get(spec))
      .filter((column): column is MeasuredColumn => column !== undefined);

  const seen = new Set<string>();
  const unique = (columns: Array<MeasuredColumn>): Array<MeasuredColumn> => {
    const key = columns.map((column) => column.spec.key).join(",");
    if (key.length === 0 || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return columns;
  };

  return ROOT_LAYOUTS.map((layout) => unique(resolveLayout(layout))).filter(
    (columns) => columns.length > 0,
  );
};

const minimumWidthForSet = (columns: ReadonlyArray<MeasuredColumn>): number =>
  visibleWidth(
    columns.map((column) => column.measure.min),
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
  stickyWidths: Map<string, number> = new Map(),
): RootColumnInstance => {
  if (rows.length === 0) {
    return emptyRootColumn(stickyWidths);
  }

  const frame = createRenderFrame(rows, now, tick, stickyWidths);
  const columnsById = measureColumns(buildColumns(frame));
  const selectedColumns = selectColumnSet(resolveRootLayouts(columnsById), terminalColumns);
  const targetWidth =
    terminalColumns === undefined
      ? visibleWidth(
          selectedColumns.map((column) => column.preferredWidth),
          ROOT_GAP,
        )
      : terminalColumns;
  const columns = widthForSelectedSet(selectedColumns, targetWidth)
    .map((width, index) => ({
      spec: selectedColumns[index]!.spec,
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
            key={column.spec.key}
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
