import { Box } from "ink";
import type { Column, RenderFrameContextValue, RootColumnSpec } from "./node";
import { AmountColumn } from "./progress/amount-column";
import { BarColumn } from "./progress/bar-column";
import { PercentColumn } from "./progress/percent-column";
import { PERCENT_FALLBACK_WIDTH, computeProgressMetrics } from "./progress/shared";

const PROGRESS_BAR_KEY = "progress.bar";
const PROGRESS_AMOUNT_KEY = "progress.amount";

type ProgressColumnMode = "full" | "percent";

export interface ProgressMetricsColumnConfig {
  readonly mode?: ProgressColumnMode;
}

interface AmountOnlyLayout {
  readonly kind: "amount-only";
}

interface PercentLayout {
  readonly kind: "percent";
}

interface BarAmountLayout {
  readonly kind: "bar-amount";
  readonly barWidth: number;
  readonly amountWidth: number;
}

type ProgressLayout = AmountOnlyLayout | PercentLayout | BarAmountLayout;

interface ProgressColumnModel {
  readonly metrics: ReturnType<typeof computeProgressMetrics>;
  readonly percent: Column;
  readonly amount?: Column;
  readonly bar?: Column;
}

const createProgressColumnModel = (
  frame: RenderFrameContextValue,
  mode: ProgressColumnMode,
): ProgressColumnModel => {
  const metrics = computeProgressMetrics(frame);
  const percent = PercentColumn(frame);

  // Determinate percent mode is fixed-width percent text; it does not need bar/amount parts.
  if (mode === "percent" && metrics.hasDeterminate) {
    return {
      metrics,
      percent,
    };
  }

  return {
    metrics,
    percent,
    amount: AmountColumn(frame, {
      key: PROGRESS_AMOUNT_KEY,
      stickyWidth: true,
    }),
    bar: metrics.hasDeterminate
      ? BarColumn(frame, {
          key: PROGRESS_BAR_KEY,
          fullWidth: false,
          stickyWidth: true,
        })
      : undefined,
  };
};

const layoutForWidth = (
  width: number,
  model: Pick<ProgressColumnModel, "metrics" | "amount" | "bar">,
): ProgressLayout => {
  if (!model.metrics.hasDeterminate || model.amount === undefined) {
    return { kind: "amount-only" };
  }

  const bar = model.bar;
  if (bar === undefined) {
    return { kind: "percent" };
  }

  const combinedMin = bar.measure.min + 1 + model.amount.measure.min;
  if (width < combinedMin || width < PERCENT_FALLBACK_WIDTH) {
    return { kind: "percent" };
  }

  const available = Math.max(0, width - 1);
  const amountWidth = Math.min(
    model.amount.measure.preferred,
    Math.max(model.amount.measure.min, available - bar.measure.min),
  );
  return {
    kind: "bar-amount",
    barWidth: Math.max(bar.measure.min, available - amountWidth),
    amountWidth,
  };
};

export const ProgressMetricsColumn = (
  frame: RenderFrameContextValue,
  config: ProgressMetricsColumnConfig = {},
): Column | undefined => {
  const mode = config.mode ?? "full";
  const model = createProgressColumnModel(frame, mode);
  if (!model.metrics.hasStructuredCounts && !model.metrics.hasDeterminate) {
    return undefined;
  }

  if (mode === "percent" && model.metrics.hasDeterminate) {
    return model.percent;
  }

  const amount = model.amount;
  if (amount === undefined) {
    return undefined;
  }

  const preferred =
    model.metrics.hasDeterminate && model.bar !== undefined
      ? model.bar.measure.preferred + 1 + amount.measure.preferred
      : amount.measure.preferred;
  const fullMin =
    model.metrics.hasDeterminate && model.bar !== undefined
      ? model.bar.measure.min + 1 + amount.measure.min
      : amount.measure.min;
  const max =
    !model.metrics.hasDeterminate || model.bar === undefined || model.bar.measure.max === undefined
      ? amount.measure.max
      : model.bar.measure.max + 1 + amount.measure.preferred;

  return {
    measure: {
      min: !model.metrics.hasDeterminate ? amount.measure.min : fullMin,
      preferred,
      max,
    },
    render: (taskId, width) => {
      const layout = layoutForWidth(width, model);

      if (layout.kind === "percent") {
        return model.percent.render(taskId, width);
      }

      if (layout.kind === "amount-only") {
        return amount.render(taskId, width);
      }

      return (
        <Box flexDirection="row" width={width}>
          <Box width={layout.barWidth}>{model.bar!.render(taskId, layout.barWidth)}</Box>
          <Box marginRight={1} />
          <Box width={layout.amountWidth}>{amount.render(taskId, layout.amountWidth)}</Box>
        </Box>
      );
    },
  };
};

const createProgressRootColumn = (key: string, mode: ProgressColumnMode): RootColumnSpec => ({
  key,
  create: (frame) => ProgressMetricsColumn(frame, { mode }),
});

export const ProgressRootColumn = createProgressRootColumn("progress", "full");

export const ProgressPercentRootColumn = createProgressRootColumn("progress-percent", "percent");
