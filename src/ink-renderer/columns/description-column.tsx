import cliSpinners from "cli-spinners";
import { Box, Text, type DOMElement } from "ink";
import { memo, useMemo, useRef } from "react";
import type { TaskSnapshot } from "../../types";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useStickyWidth } from "../hooks/use-sticky-width";
import { useRenderFrame } from "../render-frame-context";
import { useSpinnerTick } from "../spinner-context";
import type { ColumnMeasure } from "./layout-policy";

const MIN_DESCRIPTION_WIDTH = 1;
const MIN_PLAIN_DESCRIPTION_WIDTH = 8;
const MIN_TREE_DESCRIPTION_TEXT_WIDTH = 6;

export type DescriptionVariant = "tree" | "plain" | "compact" | "spinner";
type TaskIndicatorColor = "green" | "yellow" | "red";

interface TaskIndicator {
  readonly symbol: string;
  readonly color: TaskIndicatorColor;
}

const SPINNER_FRAMES = cliSpinners.dots.frames;

const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: TaskSnapshot["units"] & { readonly total: number } } =>
  task.units.total !== undefined;

const getSpinnerIndicator = (tick: number): TaskIndicator => ({
  symbol:
    SPINNER_FRAMES[
      ((tick % SPINNER_FRAMES.length) + SPINNER_FRAMES.length) % SPINNER_FRAMES.length
    ] ??
    SPINNER_FRAMES[0] ??
    "",
  color: "yellow",
});

const getTaskIndicator = (task: TaskSnapshot, tick: number): TaskIndicator => {
  if (task.status === "running") {
    return getSpinnerIndicator(tick);
  }

  if (task.status === "failed") {
    return { symbol: "✗", color: "red" };
  }

  if (!isDeterminate(task)) {
    return { symbol: "✓", color: "green" };
  }

  const { succeeded, failed, processed, total } = task.units;
  if (failed === 0 && processed === total) {
    return { symbol: "✓", color: "green" };
  }
  if (failed > 0 && succeeded > 0) {
    return { symbol: "~", color: "yellow" };
  }
  if (failed > 0 && succeeded === 0) {
    return { symbol: "✗", color: "red" };
  }

  return { symbol: "✓", color: "green" };
};

const maxDescriptionWidth = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
  includeTreePrefix: boolean,
): number =>
  rows.reduce((max, row) => {
    return Math.max(
      max,
      (includeTreePrefix
        ? row.derived.treePrefixedDescriptionWidth
        : row.derived.descriptionWidth) + 2,
    );
  }, MIN_PLAIN_DESCRIPTION_WIDTH);

const minTreeDescriptionWidth = (rows: ReturnType<typeof useRenderFrame>["rows"]): number =>
  rows.reduce(
    (max, row) => Math.max(max, row.derived.treePrefixWidth + 2 + MIN_TREE_DESCRIPTION_TEXT_WIDTH),
    MIN_PLAIN_DESCRIPTION_WIDTH,
  );

const preferredDescriptionWidth = (rows: ReturnType<typeof useRenderFrame>["rows"]): number => {
  const hasNestedRows = rows.some((row) => row.tree.depth > 0);
  return hasNestedRows
    ? Math.max(maxDescriptionWidth(rows, true), minTreeDescriptionWidth(rows))
    : maxDescriptionWidth(rows, false);
};

export const hasRenderableProgress = (rows: ReturnType<typeof useRenderFrame>["rows"]): boolean =>
  rows.some((row) => row.derived.hasRenderableProgress);

export const descriptionColumnMeasure = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
): ColumnMeasure => ({
  id: "description",
  min: MIN_DESCRIPTION_WIDTH,
  preferred: preferredDescriptionWidth(rows),
});

const resolveDescriptionVariant = (
  width: number,
  hasMeasured: boolean,
  rows: ReturnType<typeof useRenderFrame>["rows"],
): DescriptionVariant => {
  const hasNestedRows = rows.some((row) => row.tree.depth > 0);

  if (!hasMeasured) {
    return hasNestedRows ? "tree" : "plain";
  }

  if (width <= 1) {
    return "spinner";
  }

  if (width < MIN_PLAIN_DESCRIPTION_WIDTH) {
    return "compact";
  }

  const maxTreePrefixWidth = rows.reduce(
    (max, row) => Math.max(max, row.derived.treePrefixWidth),
    0,
  );

  return hasNestedRows && width >= maxTreePrefixWidth + MIN_PLAIN_DESCRIPTION_WIDTH
    ? "tree"
    : "plain";
};

const RunningTaskIndicator = memo(() => {
  const tick = useSpinnerTick();
  const indicator = getSpinnerIndicator(tick);

  return <Text color={indicator.color}>{indicator.symbol}</Text>;
});

const TaskIndicatorGlyph = ({ task }: { readonly task: TaskSnapshot }) => {
  if (task.status === "running") {
    return <RunningTaskIndicator />;
  }

  const indicator = getTaskIndicator(task, 0);
  return <Text color={indicator.color}>{indicator.symbol}</Text>;
};

export const DescriptionColumn = ({
  assignedWidth,
  marginRight = 0,
}: {
  readonly assignedWidth?: number;
  readonly marginRight?: number;
}) => {
  const frame = useRenderFrame();
  const ref = useRef<DOMElement>(null);
  const metrics = useBoxMetrics(ref);
  const preferredWidth = useMemo(() => preferredDescriptionWidth(frame.rows), [frame.rows]);
  const stickyWidth = useStickyWidth(preferredWidth);
  const baseWidth = assignedWidth ?? stickyWidth;
  const effectiveWidth = Math.max(0, baseWidth);
  const hasResolvedWidth = metrics.hasMeasured || assignedWidth !== undefined;
  const variant = resolveDescriptionVariant(
    metrics.width || effectiveWidth,
    hasResolvedWidth,
    frame.rows,
  );

  return (
    <Box
      ref={ref}
      flexDirection="column"
      flexGrow={0}
      flexShrink={1}
      flexBasis={effectiveWidth}
      width={effectiveWidth}
      minWidth={MIN_DESCRIPTION_WIDTH}
      marginRight={marginRight}
    >
      {frame.rows.map((row) => {
        const treePrefix = variant === "tree" ? row.derived.treePrefix : "";

        return (
          <Box key={row.task.id as number} height={1}>
            {variant === "spinner" ? (
              <TaskIndicatorGlyph task={row.task} />
            ) : (
              <Text wrap="truncate-end">
                {treePrefix}
                <TaskIndicatorGlyph task={row.task} />
                {` ${row.task.description}`}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
