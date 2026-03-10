import { Box, Text, type DOMElement } from "ink";
import { useMemo, useRef } from "react";
import { useBoxMetrics } from "../hooks/use-box-metrics";
import { useStickyWidth } from "../hooks/use-sticky-width";
import { useRenderFrame } from "../render-frame-context";
import {
  type DescriptionCap,
  type DescriptionVariant,
  MIN_DESCRIPTION_WIDTH,
  getTaskIndicator,
  preferredDescriptionWidthForCap,
  renderTreePrefix,
  textWidth,
} from "./shared";

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
    return width < 8 ? "compact" : "plain";
  }

  if (width < 8) {
    return "compact";
  }

  const maxTreePrefixWidth = rows.reduce(
    (max, row) => Math.max(max, textWidth(renderTreePrefix(row.tree))),
    0,
  );

  return hasNestedRows && width >= maxTreePrefixWidth + 8 ? "tree" : "plain";
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
