export interface ColumnMeasure {
  readonly id: "description" | "progress" | "elapsed" | "eta";
  readonly min: number;
  readonly preferred: number;
}

export const COLUMN_GAP = 1;

const visibleWidth = (widths: ReadonlyArray<number>, gap: number): number => {
  const visible = widths.filter((width) => width > 0);
  return visible.reduce((sum, width) => sum + width, 0) + Math.max(0, visible.length - 1) * gap;
};

const nextDistinctWidth = (
  entries: ReadonlyArray<{ readonly width: number }>,
  widest: number,
): number | undefined => entries.find((entry) => entry.width < widest)?.width;

const reduceOverflowRichStyle = (
  widths: Array<number>,
  minimums: ReadonlyArray<number>,
  targetWidth: number,
  gap: number,
): Array<number> => {
  let overflow = visibleWidth(widths, gap) - targetWidth;
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

export const assignedWidthsForMeasures = (
  measures: ReadonlyArray<ColumnMeasure>,
  targetWidth: number | undefined,
): Map<ColumnMeasure["id"], number> => {
  const preferredWidths = measures.map((measure) => Math.max(measure.min, measure.preferred));
  const widths =
    targetWidth === undefined || visibleWidth(preferredWidths, COLUMN_GAP) <= targetWidth
      ? preferredWidths
      : reduceOverflowRichStyle(
          [...preferredWidths],
          measures.map((measure) => measure.min),
          targetWidth,
          COLUMN_GAP,
        );

  return new Map(measures.map((measure, index) => [measure.id, widths[index]!] as const));
};
