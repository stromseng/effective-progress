import { Box, Text, type DOMElement } from "ink";
import { useMemo, useRef } from "react";
import type { TaskTreeInfo } from "../store/types";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useStickyWidth } from "../hooks/use-sticky-width";
import { useRenderFrame } from "../render-frame-context";
import { getTaskIndicator } from "../shared/format";
import { textWidth } from "../shared/text-width";

const MIN_DESCRIPTION_WIDTH = 1;
const MIN_PLAIN_DESCRIPTION_WIDTH = 8;
const MIN_COMPACT_DESCRIPTION_WIDTH = 3;
const MIN_TREE_DESCRIPTION_TEXT_WIDTH = 6;

export type DescriptionVariant = "tree" | "plain" | "compact" | "spinner";
export type DescriptionCap = DescriptionVariant;

const treeAncestorPrefix = (ancestorHasNextSibling: ReadonlyArray<boolean>): string =>
  ancestorHasNextSibling
    .slice(1)
    .map((hasNextSibling) => (hasNextSibling ? "│  " : "   "))
    .join("");

export const renderTreePrefix = (tree: TaskTreeInfo): string => {
  if (tree.depth <= 0) {
    return "";
  }

  return `${treeAncestorPrefix(tree.ancestorHasNextSibling)}${tree.hasNextSibling ? "├─ " : "└─ "}`;
};

const maxDescriptionWidth = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
  includeTreePrefix: boolean,
): number =>
  rows.reduce((max, row) => {
    const prefix = includeTreePrefix ? renderTreePrefix(row.tree) : "";
    return Math.max(max, textWidth(`${prefix}${row.task.description}`) + 2);
  }, MIN_PLAIN_DESCRIPTION_WIDTH);

export const minTreeDescriptionWidth = (rows: ReturnType<typeof useRenderFrame>["rows"]): number =>
  rows.reduce(
    (max, row) =>
      Math.max(max, textWidth(renderTreePrefix(row.tree)) + 2 + MIN_TREE_DESCRIPTION_TEXT_WIDTH),
    MIN_PLAIN_DESCRIPTION_WIDTH,
  );

const preferredDescriptionWidth = (rows: ReturnType<typeof useRenderFrame>["rows"]): number => {
  const hasNestedRows = rows.some((row) => row.tree.depth > 0);
  return hasNestedRows
    ? Math.max(maxDescriptionWidth(rows, true), minTreeDescriptionWidth(rows))
    : maxDescriptionWidth(rows, false);
};

export const preferredDescriptionWidthForCap = (
  rows: ReturnType<typeof useRenderFrame>["rows"],
  cap: DescriptionCap,
): number => {
  if (cap === "compact") {
    return maxDescriptionWidth(rows, false);
  }

  if (cap === "plain") {
    return maxDescriptionWidth(rows, false);
  }

  return preferredDescriptionWidth(rows);
};

export const hasRenderableProgress = (rows: ReturnType<typeof useRenderFrame>["rows"]): boolean =>
  rows.some((row) => row.task.units.total !== undefined || row.task.units.processed > 0);

export const minimumDescriptionWidth = (cap: DescriptionCap): number =>
  cap === "spinner"
    ? MIN_DESCRIPTION_WIDTH
    : cap === "compact"
      ? MIN_COMPACT_DESCRIPTION_WIDTH
      : MIN_PLAIN_DESCRIPTION_WIDTH;

const resolveDescriptionVariant = (
  width: number,
  hasMeasured: boolean,
  rows: ReturnType<typeof useRenderFrame>["rows"],
  cap: DescriptionCap,
): DescriptionVariant => {
  if (cap === "spinner") {
    return "spinner";
  }

  const hasNestedRows = rows.some((row) => row.tree.depth > 0);

  if (!hasMeasured) {
    return cap === "compact"
      ? "compact"
      : cap === "plain"
        ? "plain"
        : hasNestedRows
          ? "tree"
          : "plain";
  }

  if (width <= 1) {
    return "spinner";
  }

  if (cap === "compact") {
    return "compact";
  }

  if (cap === "plain") {
    return width < minimumDescriptionWidth("plain") ? "compact" : "plain";
  }

  if (width < minimumDescriptionWidth("plain")) {
    return "compact";
  }

  const maxTreePrefixWidth = rows.reduce(
    (max, row) => Math.max(max, textWidth(renderTreePrefix(row.tree))),
    0,
  );

  return hasNestedRows && width >= maxTreePrefixWidth + minimumDescriptionWidth("plain")
    ? "tree"
    : "plain";
};

export const DescriptionColumn = ({
  cap,
  assignedWidth,
  marginRight = 0,
}: {
  readonly cap: DescriptionCap;
  readonly assignedWidth?: number;
  readonly marginRight?: number;
}) => {
  const frame = useRenderFrame();
  const ref = useRef<DOMElement>(null);
  const metrics = useBoxMetrics(ref);
  const preferredWidth = useMemo(
    () => preferredDescriptionWidthForCap(frame.rows, cap),
    [cap, frame.rows],
  );
  const stickyWidth = useStickyWidth(preferredWidth);
  const baseWidth = assignedWidth ?? stickyWidth;
  const hasResolvedWidth = metrics.hasMeasured || assignedWidth !== undefined;
  const variant = resolveDescriptionVariant(
    metrics.width || baseWidth,
    hasResolvedWidth,
    frame.rows,
    cap,
  );

  return (
    <Box
      ref={ref}
      flexDirection="column"
      flexGrow={0}
      flexShrink={1}
      flexBasis={baseWidth}
      width={baseWidth}
      minWidth={MIN_DESCRIPTION_WIDTH}
      marginRight={marginRight}
    >
      {frame.rows.map((row) => {
        const indicator = getTaskIndicator(row.task, frame.tick);
        const treePrefix = variant === "tree" ? renderTreePrefix(row.tree) : "";

        return (
          <Box key={row.task.id as number} height={1}>
            {variant === "spinner" ? (
              <Text color={indicator.color}>{indicator.symbol}</Text>
            ) : (
              <Text wrap="truncate-end">
                {treePrefix}
                <Text color={indicator.color}>{indicator.symbol}</Text>
                {` ${row.task.description}`}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
