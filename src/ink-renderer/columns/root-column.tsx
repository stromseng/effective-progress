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
import type { ColumnDefinition, RenderFrameContextValue, WidthMeasure } from "./node";
import { ProgressPercentRootColumn, ProgressRootColumn } from "./progress-metrics-column";
import type { TaskRowModel } from "../snapshot/types";
import type { StickyWidthKey } from "./sticky-width";

const ROOT_GAP = 1;

const visibleWidth = (widths: ReadonlyArray<number>, gap: number): number => {
  const visible = widths.filter((width) => width > 0);
  return visible.reduce((sum, width) => sum + width, 0) + Math.max(0, visible.length - 1) * gap;
};

interface MeasuredColumn {
  readonly definition: ColumnDefinition;
  readonly id: string;
  readonly measure: WidthMeasure;
  readonly preferredWidth: number;
  readonly commitStickyWidth?: () => void;
  readonly render: (taskId: TaskId, width: number) => ReactNode;
}

export interface RootColumnInstance {
  render: () => ReactNode;
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
] as const satisfies ReadonlyArray<ReadonlyArray<ColumnDefinition>>;

const ROOT_COLUMNS = [
  ...new Map(ROOT_LAYOUTS.flat().map((column) => [column.id, column])).values(),
] satisfies ReadonlyArray<ColumnDefinition>;

const measureColumns = (frame: RenderFrameContextValue): ReadonlyMap<string, MeasuredColumn> =>
  new Map(
    ROOT_COLUMNS.flatMap((definition) => {
      const column = definition.build(frame);
      if (column === undefined) {
        return [];
      }

      const measure = column.measure;
      return [
        [
          definition.id,
          {
            definition,
            id: definition.id,
            measure,
            preferredWidth: measure.preferred,
            commitStickyWidth: column.commitStickyWidth,
            render: column.render,
          } satisfies MeasuredColumn,
        ] as const,
      ];
    }),
  );

const candidateRootLayouts = (
  columnsById: ReadonlyMap<string, MeasuredColumn>,
): Array<ReadonlyArray<ColumnDefinition>> => {
  const hasProgress = columnsById.has(ProgressRootColumn.id);
  const hasPercentProgress = columnsById.has(ProgressPercentRootColumn.id);
  const hasEta = columnsById.has(EtaRootColumn.id);

  return [
    ...(hasProgress && hasEta
      ? [
          [DescriptionTreeRootColumn, ProgressRootColumn, ElapsedRootColumn, EtaRootColumn],
          [DescriptionPlainRootColumn, ProgressRootColumn, ElapsedRootColumn, EtaRootColumn],
        ]
      : []),
    ...(hasProgress && !hasEta
      ? [
          [DescriptionTreeRootColumn, ProgressRootColumn, ElapsedRootColumn],
          [DescriptionPlainRootColumn, ProgressRootColumn, ElapsedRootColumn],
        ]
      : []),
    ...(hasPercentProgress && hasEta
      ? [[DescriptionPlainRootColumn, ProgressPercentRootColumn, ElapsedRootColumn, EtaRootColumn]]
      : []),
    ...(hasPercentProgress
      ? [
          [DescriptionPlainRootColumn, ProgressPercentRootColumn, ElapsedRootColumn],
          [DescriptionPlainRootColumn, ProgressPercentRootColumn],
          [DescriptionCompactRootColumn, ProgressPercentRootColumn],
        ]
      : []),
    ...(!hasProgress && !hasPercentProgress
      ? [
          [DescriptionTreeRootColumn, ElapsedRootColumn],
          [DescriptionPlainRootColumn, ElapsedRootColumn],
          [DescriptionPlainRootColumn],
        ]
      : []),
    [DescriptionCompactRootColumn],
    [DescriptionSpinnerRootColumn],
  ];
};

const resolveRootLayouts = (
  columnsById: ReadonlyMap<string, MeasuredColumn>,
): Array<Array<MeasuredColumn>> => {
  const resolveLayout = (
    definitions: ReadonlyArray<ColumnDefinition>,
  ): Array<MeasuredColumn> | undefined => {
    const columns: Array<MeasuredColumn> = [];

    for (const definition of definitions) {
      const column = columnsById.get(definition.id);
      if (column === undefined) {
        return undefined;
      }

      columns.push(column);
    }

    return columns;
  };

  return candidateRootLayouts(columnsById)
    .map(resolveLayout)
    .filter((columns): columns is Array<MeasuredColumn> => columns !== undefined);
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

const nextDistinctWidth = (
  entries: ReadonlyArray<{ readonly width: number }>,
  widest: number,
): number | undefined => entries.find((entry) => entry.width < widest)?.width;

const reduceOverflowRichStyle = (
  widths: Array<number>,
  minimums: ReadonlyArray<number>,
  targetWidth: number,
): Array<number> => {
  let overflow = visibleWidth(widths, ROOT_GAP) - targetWidth;
  while (overflow > 0) {
    const shrinkable = widths
      .map((width, index) => ({
        width,
        index,
        minimum: minimums[index] ?? width,
      }))
      .filter(({ width, minimum }) => width > minimum)
      .sort((left, right) => right.width - left.width || left.index - right.index);
    if (shrinkable.length === 0) {
      break;
    }

    const widest = shrinkable[0]!.width;
    const cohort = shrinkable.filter(({ width }) => width === widest);
    const nextWidth = nextDistinctWidth(shrinkable, widest);
    const floor = Math.max(nextWidth ?? 0, ...cohort.map(({ minimum }) => minimum));
    const maxUniformDrop = widest - floor;
    const uniformDrop = Math.min(maxUniformDrop, Math.floor(overflow / cohort.length));

    if (uniformDrop > 0) {
      for (const { index } of cohort) {
        widths[index] = widths[index]! - uniformDrop;
      }
      overflow -= uniformDrop * cohort.length;
      continue;
    }

    let changed = false;
    for (const { index, minimum } of cohort) {
      if (overflow <= 0) {
        break;
      }
      if (widths[index]! <= minimum) {
        continue;
      }

      widths[index] = widths[index]! - 1;
      overflow -= 1;
      changed = true;
    }

    if (!changed) {
      break;
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

const emptyRootColumn = (stickyWidths: Map<StickyWidthKey, number>): RootColumnInstance => {
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
  stickyWidths: Map<StickyWidthKey, number> = new Map(),
): RootColumnInstance => {
  if (rows.length === 0) {
    return emptyRootColumn(stickyWidths);
  }

  const frame = createRenderFrame(rows, now, tick, stickyWidths);
  const columnsById = measureColumns(frame);
  const selectedColumns = selectColumnSet(resolveRootLayouts(columnsById), terminalColumns);
  for (const column of selectedColumns) {
    column.commitStickyWidth?.();
  }
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
