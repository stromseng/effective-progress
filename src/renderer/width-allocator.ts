import type { TaskRowModel } from "./store/types";
import type { ProgressColumnDefinition, ProgressColumnMeasureContext } from "./public-api";

interface NormalizedColumnMeasurement {
  readonly definition: ProgressColumnDefinition;
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly preferredWidth: number;
  readonly sticky: boolean;
  readonly stickyLimit?: number;
}

interface PlannedColumn {
  readonly definition: ProgressColumnDefinition;
  readonly width: number;
}

interface PlannedColumnLayout {
  readonly columns: ReadonlyArray<PlannedColumn>;
  readonly nextStickyWidths: Map<number, number>;
}

export const RENDERER_COLUMN_GAP = 1;

const clampWidth = (width: number, minWidth: number, maxWidth?: number): number =>
  maxWidth === undefined
    ? Math.max(minWidth, width)
    : Math.max(minWidth, Math.min(maxWidth, width));

const normalizeMeasurement = (
  definition: ProgressColumnDefinition,
  context: ProgressColumnMeasureContext,
): NormalizedColumnMeasurement => {
  if (definition.fixedWidth !== undefined) {
    const width = Math.max(0, definition.fixedWidth);

    return {
      definition,
      minWidth: width,
      maxWidth: width,
      preferredWidth: width,
      sticky: definition.sticky === true,
      stickyLimit: width,
    };
  }

  const measured = definition.measure(context);
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
    sticky: definition.sticky === true,
    stickyLimit,
  };
};

const visibleIndices = (widths: ReadonlyArray<number>): Array<number> =>
  widths.flatMap((width, index) => (width > 0 ? [index] : []));

const totalVisibleWidth = (widths: ReadonlyArray<number>): number => {
  const indices = visibleIndices(widths);
  if (indices.length === 0) {
    return 0;
  }

  return indices.reduce((sum, index, visibleIndex) => {
    const padding = visibleIndex < indices.length - 1 ? RENDERER_COLUMN_GAP : 0;
    return sum + widths[index]! + padding;
  }, 0);
};

const nextDistinctWidth = (
  entries: ReadonlyArray<{
    readonly index: number;
    readonly width: number;
    readonly minWidth: number;
  }>,
  widest: number,
): number | undefined => entries.find((entry) => entry.width < widest)?.width;

const shrinkWidestFirst = (
  widths: Array<number>,
  columns: ReadonlyArray<NormalizedColumnMeasurement>,
  targetWidth: number,
  canShrink: (index: number) => boolean,
): Array<number> => {
  while (totalVisibleWidth(widths) > targetWidth) {
    const shrinkable = widths
      .map((width, index) => ({
        index,
        width,
        minWidth: columns[index]!.minWidth,
      }))
      .filter(({ index, width, minWidth }) => width > minWidth && canShrink(index))
      .sort((left, right) => right.width - left.width || right.index - left.index);

    if (shrinkable.length === 0) {
      break;
    }

    const overflow = totalVisibleWidth(widths) - targetWidth;
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
      if (totalVisibleWidth(widths) <= targetWidth) {
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

const forceFitFromRight = (
  widths: Array<number>,
  columns: ReadonlyArray<NormalizedColumnMeasurement>,
  targetWidth: number,
  canShrink: (index: number) => boolean,
): Array<number> => {
  while (totalVisibleWidth(widths) > targetWidth) {
    const rightmostVisibleIndex = widths.findLastIndex(
      (width, index) => width > 0 && canShrink(index),
    );
    if (rightmostVisibleIndex < 0) {
      break;
    }

    widths[rightmostVisibleIndex] = widths[rightmostVisibleIndex]! - 1;
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
    let remaining = targetWidth - totalVisibleWidth(widths);

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
  now: number,
  terminalColumns: number | undefined,
  previousStickyWidths: ReadonlyMap<number, number>,
): PlannedColumnLayout => {
  const measureContext = { rows, now };
  const columns = definitions.map((definition) => normalizeMeasurement(definition, measureContext));
  let widths = columns.map((column) => column.preferredWidth);

  if (terminalColumns !== undefined) {
    widths = shrinkWidestFirst(
      [...widths],
      columns,
      terminalColumns,
      (index) => columns[index]!.definition.fixedWidth === undefined,
    );

    if (totalVisibleWidth(widths) > terminalColumns) {
      widths = forceFitFromRight(
        [...widths],
        columns,
        terminalColumns,
        (index) => columns[index]!.definition.fixedWidth === undefined,
      );
    }
  }

  const stickyResult = applyStickyGrowth(widths, columns, terminalColumns, previousStickyWidths);
  const visible = stickyResult.widths
    .map((width, index) => ({
      definition: columns[index]!.definition,
      width,
    }))
    .filter(({ width }) => width > 0);

  return {
    columns: visible,
    nextStickyWidths: stickyResult.nextStickyWidths,
  };
};
