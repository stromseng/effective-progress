import type { TaskRowModel } from "../ink-renderer/store/types";
import type { ProgressColumnDefinition } from "./public-api.sketch";

interface NormalizedColumnMeasurement {
  readonly definition: ProgressColumnDefinition;
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly preferredWidth: number;
  readonly paddingRight: number;
  readonly sticky: boolean;
  readonly stickyLimit?: number;
}

export interface PlannedColumn {
  readonly definition: ProgressColumnDefinition;
  readonly width: number;
  readonly paddingRight: number;
}

interface PlannedColumnLayout {
  readonly columns: ReadonlyArray<PlannedColumn>;
  readonly nextStickyWidths: Map<number, number>;
}

const clampWidth = (width: number, minWidth: number, maxWidth?: number): number =>
  maxWidth === undefined
    ? Math.max(minWidth, width)
    : Math.max(minWidth, Math.min(maxWidth, width));

const normalizeMeasurement = (
  definition: ProgressColumnDefinition,
  rows: ReadonlyArray<TaskRowModel>,
): NormalizedColumnMeasurement => {
  if (definition.fixedWidth !== undefined) {
    const width = Math.max(0, definition.fixedWidth);

    return {
      definition,
      minWidth: width,
      maxWidth: width,
      preferredWidth: width,
      paddingRight: Math.max(0, definition.paddingRight ?? 0),
      sticky: definition.sticky === true,
      stickyLimit: width,
    };
  }

  const measured = definition.measure(rows);
  const minWidth = Math.max(0, measured.minWidth);
  const maxWidth =
    measured.maxWidth === undefined ? undefined : Math.max(minWidth, measured.maxWidth);
  const preferredWidth = clampWidth(measured.preferredWidth, minWidth, maxWidth);
  const stickyLimit =
    definition.sticky !== true
      ? undefined
      : definition.stickyMaxWidth !== undefined
        ? Math.max(minWidth, definition.stickyMaxWidth)
        : maxWidth;

  return {
    definition,
    minWidth,
    maxWidth,
    preferredWidth,
    paddingRight: Math.max(0, definition.paddingRight ?? 0),
    sticky: definition.sticky === true,
    stickyLimit,
  };
};

const visibleIndices = (widths: ReadonlyArray<number>): Array<number> =>
  widths.flatMap((width, index) => (width > 0 ? [index] : []));

const totalVisibleWidth = (
  widths: ReadonlyArray<number>,
  columns: ReadonlyArray<NormalizedColumnMeasurement>,
): number => {
  const indices = visibleIndices(widths);
  if (indices.length === 0) {
    return 0;
  }

  return indices.reduce((sum, index, visibleIndex) => {
    const padding = visibleIndex < indices.length - 1 ? columns[index]!.paddingRight : 0;
    return sum + widths[index]! + padding;
  }, 0);
};

const nextDistinctWidth = (
  entries: ReadonlyArray<{ readonly index: number; readonly width: number; readonly minWidth: number }>,
  widest: number,
): number | undefined => entries.find((entry) => entry.width < widest)?.width;

const shrinkWidestFirst = (
  widths: Array<number>,
  columns: ReadonlyArray<NormalizedColumnMeasurement>,
  targetWidth: number,
  canShrink: (index: number) => boolean,
): Array<number> => {
  while (totalVisibleWidth(widths, columns) > targetWidth) {
    const shrinkable = widths
      .map((width, index) => ({
        index,
        width,
        minWidth: columns[index]!.minWidth,
      }))
      .filter(({ index, width, minWidth }) => width > minWidth && canShrink(index))
      .sort((left, right) => right.width - left.width || left.index - right.index);

    if (shrinkable.length === 0) {
      break;
    }

    const overflow = totalVisibleWidth(widths, columns) - targetWidth;
    const widest = shrinkable[0]!.width;
    const cohort = shrinkable.filter((entry) => entry.width === widest);
    const floor = Math.max(
      nextDistinctWidth(shrinkable, widest) ?? 0,
      ...cohort.map((entry) => entry.minWidth),
    );
    const maxUniformDrop = widest - floor;
    const uniformDrop = Math.min(maxUniformDrop, Math.floor(overflow / cohort.length));

    if (uniformDrop > 0) {
      for (const { index } of cohort) {
        widths[index] = Math.max(columns[index]!.minWidth, widths[index]! - uniformDrop);
      }
      continue;
    }

    let changed = false;
    for (const { index, minWidth } of cohort) {
      if (totalVisibleWidth(widths, columns) <= targetWidth) {
        break;
      }

      if (widths[index]! <= minWidth) {
        continue;
      }

      widths[index] = widths[index]! - 1;
      changed = true;
    }

    if (!changed) {
      break;
    }
  }

  return widths;
};

const applyStickyGrowth = (
  widths: Array<number>,
  columns: ReadonlyArray<NormalizedColumnMeasurement>,
  targetWidth: number | undefined,
  previousStickyWidths: ReadonlyMap<number, number>,
): { readonly widths: Array<number>; readonly nextStickyWidths: Map<number, number> } => {
  const stickyTargets = columns.map((column, index) => {
    if (!column.sticky) {
      return undefined;
    }

    return clampWidth(
      Math.max(previousStickyWidths.get(index) ?? 0, column.preferredWidth),
      column.minWidth,
      column.stickyLimit,
    );
  });

  if (targetWidth === undefined) {
    stickyTargets.forEach((target, index) => {
      if (target !== undefined) {
        widths[index] = Math.max(widths[index]!, target);
      }
    });
  } else {
    let remaining = targetWidth - totalVisibleWidth(widths, columns);

    if (remaining > 0) {
      stickyTargets.forEach((target, index) => {
        if (target === undefined || remaining <= 0) {
          return;
        }

        const deficit = Math.max(0, target - widths[index]!);
        const growth = Math.min(deficit, remaining);
        widths[index] = widths[index]! + growth;
        remaining -= growth;
      });
    }
  }

  const nextStickyWidths = new Map<number, number>();
  stickyTargets.forEach((target, index) => {
    if (target === undefined) {
      return;
    }

    nextStickyWidths.set(
      index,
      clampWidth(
        Math.max(target, widths[index]!),
        columns[index]!.minWidth,
        columns[index]!.stickyLimit,
      ),
    );
  });

  return {
    widths,
    nextStickyWidths,
  };
};

export const planColumnLayout = (
  definitions: ReadonlyArray<ProgressColumnDefinition>,
  rows: ReadonlyArray<TaskRowModel>,
  terminalColumns: number | undefined,
  previousStickyWidths: ReadonlyMap<number, number>,
): PlannedColumnLayout => {
  const columns = definitions.map((definition) => normalizeMeasurement(definition, rows));
  let widths = columns.map((column) => column.preferredWidth);

  if (terminalColumns !== undefined) {
    widths = shrinkWidestFirst(
      [...widths],
      columns,
      terminalColumns,
      (index) =>
        columns[index]!.definition.fixedWidth === undefined &&
        columns[index]!.definition.noWrap !== true,
    );

    if (totalVisibleWidth(widths, columns) > terminalColumns) {
      widths = shrinkWidestFirst([...widths], columns, terminalColumns, () => true);
    }
  }

  const stickyResult = applyStickyGrowth(widths, columns, terminalColumns, previousStickyWidths);
  const visible = stickyResult.widths
    .map((width, index) => ({
      definition: columns[index]!.definition,
      width,
      paddingRight: columns[index]!.paddingRight,
    }))
    .filter(({ width }) => width > 0);

  const plannedColumns = visible.map((column, index) => ({
    ...column,
    paddingRight: index < visible.length - 1 ? column.paddingRight : 0,
  }));

  return {
    columns: plannedColumns,
    nextStickyWidths: stickyResult.nextStickyWidths,
  };
};
