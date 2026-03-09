import { Box } from "ink";
import type { Column, RenderFrameContextValue } from "./node";
import { AmountColumn } from "./progress/amount-column";
import { BarColumn } from "./progress/bar-column";
import { PercentColumn } from "./progress/percent-column";
import {
  DEFAULT_BAR_WIDTH,
  PERCENT_FALLBACK_WIDTH,
  computeProgressMetrics,
} from "./progress/shared";

const PROGRESS_BAR_KEY = "progress.bar";
const PROGRESS_AMOUNT_KEY = "progress.amount";

export interface ProgressMetricsColumnConfig {
  readonly mode?: "full" | "percent";
}

export const ProgressMetricsColumn = (
  frame: RenderFrameContextValue,
  config: ProgressMetricsColumnConfig = {},
): Column | undefined => {
  const metrics = computeProgressMetrics(frame);
  if (!metrics.hasStructuredCounts && !metrics.hasDeterminate) {
    return undefined;
  }

  const bar = BarColumn(frame, {
    key: PROGRESS_BAR_KEY,
    fullWidth: false,
    stickyWidth: true,
  });
  const amount = AmountColumn(frame, {
    key: PROGRESS_AMOUNT_KEY,
    stickyWidth: true,
  });
  const percent = PercentColumn(frame);
  const preferred = metrics.hasDeterminate
    ? bar.measure.preferred + 1 + amount.measure.preferred
    : amount.measure.preferred;
  const fullMin = bar.measure.min + 1 + amount.measure.min;
  const max =
    !metrics.hasDeterminate || bar.measure.max === undefined
      ? !metrics.hasDeterminate
        ? amount.measure.max
        : undefined
      : bar.measure.max + 1 + amount.measure.preferred;
  const layoutForWidth = (width: number) => {
    if (!metrics.hasDeterminate) {
      return { kind: "amount-only" };
    }

    const combinedMin = bar.measure.min + 1 + amount.measure.min;
    if (width < combinedMin || width < PERCENT_FALLBACK_WIDTH) {
      return { kind: "percent" };
    }

    const available = Math.max(0, width - 1);
    const amountWidth = Math.min(
      amount.measure.preferred,
      Math.max(amount.measure.min, available - bar.measure.min),
    );
    const barWidth = Math.max(bar.measure.min, available - amountWidth);
    return {
      kind: "bar-amount",
      barWidth,
      amountWidth,
    };
  };

  return {
    measure: {
      min:
        !metrics.hasDeterminate
          ? amount.measure.min
          : config.mode === "percent"
            ? percent.measure.min
            : fullMin,
      preferred:
        !metrics.hasDeterminate
          ? amount.measure.preferred
          : config.mode === "percent"
            ? percent.measure.preferred
            : preferred,
      max:
        !metrics.hasDeterminate
          ? amount.measure.max
          : config.mode === "percent"
            ? percent.measure.max
            : max,
    },
    render: (taskId, width) => {
      if (config.mode === "percent" && metrics.hasDeterminate) {
        return percent.render(taskId, width);
      }

      const layout = layoutForWidth(width);

      if (layout.kind === "percent") {
        return percent.render(taskId, width);
      }

      if (layout.kind === "amount-only") {
        return amount.render(taskId, width);
      }

      return (
        <Box flexDirection="row" width={width}>
          <Box width={layout.barWidth}>
            {bar.render(taskId, layout.barWidth ?? DEFAULT_BAR_WIDTH)}
          </Box>
          <Box marginRight={1} />
          <Box width={layout.amountWidth}>
            {amount.render(taskId, layout.amountWidth ?? 0)}
          </Box>
        </Box>
      );
    },
  };
};
