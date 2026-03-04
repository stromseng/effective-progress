import { formatAmount, formatElapsed, formatEta } from "./format";
import { renderTreePrefix } from "./tree";
import type { TaskRowModel } from "./types";

export const DEFAULT_BAR_WIDTH = 30;
const MIN_DESCRIPTION_WIDTH = 8;
const MIN_BAR_WIDTH = 8;
const MIN_ELAPSED_WIDTH = 2;
const MIN_AMOUNT_WIDTH = 0;
const BASELINE_ROW_WIDTH = 100;
export const MIN_DESCRIPTION_COLUMNS_FOR_TREE = 24;
const RESERVED_ELAPSED_WIDTH_UP_TO_ONE_HOUR = Array.from("59m 59s").length;
const RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR = Array.from("ETA: 59m 59s").length;

const textWidth = (text: string): number => Array.from(text).length;

export interface SharedColumnWidths {
  readonly row: number;
  readonly description: number;
  readonly bar: number;
  readonly amount: number;
  readonly amountSucceeded: number;
  readonly amountFailed: number;
  readonly amountProcessed: number;
  readonly amountTotal: number;
  readonly elapsed: number;
  readonly eta: number;
  readonly showTree: boolean;
}

const computeWidths = (
  rows: ReadonlyArray<TaskRowModel>,
  now: number,
  tick: number,
  terminalColumns?: number,
  includeTree = true,
): Omit<SharedColumnWidths, "showTree"> => {
  let hasDeterminate = false;
  let hasDetailedDeterminate = false;
  let description = MIN_DESCRIPTION_WIDTH;
  let amount = 0;
  let amountSucceeded = 0;
  let amountFailed = 0;
  let amountProcessed = 0;
  let amountTotal = 0;
  let elapsedContentWidth = MIN_ELAPSED_WIDTH;
  let etaContentWidth = 0;

  for (const row of rows) {
    const { task, tree } = row;
    const treePrefix = includeTree ? renderTreePrefix(tree) : "";
    description = Math.max(description, textWidth(`${treePrefix}${task.description}`) + 2);

    if (task.units._tag === "DeterminateTaskUnits") {
      hasDeterminate = true;
      const totalDigits = textWidth(`${task.units.total}`);
      if (task.countDisplay === "detailed") {
        hasDetailedDeterminate = true;
        amountSucceeded = Math.max(amountSucceeded, totalDigits);
        amountFailed = Math.max(amountFailed, totalDigits);
      }
      amountProcessed = Math.max(amountProcessed, totalDigits);
      amountTotal = Math.max(amountTotal, totalDigits);
    } else {
      amount = Math.max(amount, textWidth(formatAmount(task, tick)));
    }
    elapsedContentWidth = Math.max(elapsedContentWidth, textWidth(formatElapsed(task, now)));

    if (task.status === "running" && task.units._tag === "DeterminateTaskUnits") {
      const etaValue = formatEta(task, now);
      const etaText = `ETA: ${etaValue.length > 0 ? etaValue : "--"}`;
      etaContentWidth = Math.max(etaContentWidth, textWidth(etaText));
    }
  }

  const structuredAmount = hasDeterminate
    ? amountProcessed +
      1 +
      amountTotal +
      (hasDetailedDeterminate ? amountSucceeded + 1 + amountFailed + 1 : 0)
    : 0;
  if (hasDeterminate) {
    amount = structuredAmount;
  }

  const elapsedPreferredWidth = hasDeterminate
    ? Math.max(elapsedContentWidth, RESERVED_ELAPSED_WIDTH_UP_TO_ONE_HOUR)
    : elapsedContentWidth;
  const etaPreferredWidth =
    etaContentWidth > 0 ? Math.max(etaContentWidth, RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR) : 0;
  const bar = hasDeterminate ? DEFAULT_BAR_WIDTH : 0;
  let widths = {
    description,
    bar,
    amount,
    amountSucceeded,
    amountFailed,
    amountProcessed,
    amountTotal,
    elapsed: elapsedPreferredWidth,
    eta: etaPreferredWidth,
  };

  const visible = (w: typeof widths): Array<number> =>
    [w.description, w.bar, w.amount, w.elapsed, w.eta].filter((width) => width > 0);
  const total = (w: typeof widths): number => {
    const cols = visible(w);
    return cols.reduce((sum, width) => sum + width, 0) + Math.max(0, cols.length - 1);
  };

  const baselineTarget = hasDeterminate
    ? Math.max(BASELINE_ROW_WIDTH, total(widths))
    : total(widths);
  const target =
    terminalColumns === undefined
      ? baselineTarget
      : Math.max(1, Math.min(Math.max(1, Math.floor(terminalColumns)), baselineTarget));

  if (total(widths) < target) {
    widths.description += target - total(widths);
  } else if (total(widths) > target) {
    let overflow = total(widths) - target;

    const reduceBy = (key: keyof typeof widths, min: number) => {
      if (overflow <= 0) {
        return;
      }
      const current = widths[key];
      if (current <= min) {
        return;
      }
      const reducible = current - min;
      const delta = Math.min(reducible, overflow);
      widths = { ...widths, [key]: current - delta };
      overflow -= delta;
    };

    // Reclaim soft reserves before truncating columns.
    reduceBy("eta", etaContentWidth);
    reduceBy("elapsed", elapsedContentWidth);
    // Prefer shrinking the bar before hiding ETA entirely.
    reduceBy("bar", MIN_BAR_WIDTH);
    // Then collapse optional columns and finally truncate core columns.
    reduceBy("eta", 0);
    reduceBy("bar", 0);
    reduceBy("elapsed", MIN_ELAPSED_WIDTH);
    reduceBy("description", MIN_DESCRIPTION_WIDTH);
    reduceBy("amount", MIN_AMOUNT_WIDTH);
    reduceBy("description", 0);

    if (total(widths) < target) {
      widths.description += target - total(widths);
    }
  }

  const rowWidth = total(widths);
  const useStructuredAmount = hasDeterminate && widths.amount >= structuredAmount;

  return {
    row: rowWidth,
    description: widths.description,
    bar: widths.bar,
    amount: widths.amount,
    amountSucceeded: useStructuredAmount ? widths.amountSucceeded : 0,
    amountFailed: useStructuredAmount ? widths.amountFailed : 0,
    amountProcessed: useStructuredAmount ? widths.amountProcessed : 0,
    amountTotal: useStructuredAmount ? widths.amountTotal : 0,
    elapsed: widths.elapsed,
    eta: widths.eta,
  };
};

export const computeSharedColumnWidths = (
  rows: ReadonlyArray<TaskRowModel>,
  now: number,
  tick: number,
  terminalColumns?: number,
): SharedColumnWidths => {
  const withTree = computeWidths(rows, now, tick, terminalColumns, true);
  if (withTree.description >= MIN_DESCRIPTION_COLUMNS_FOR_TREE) {
    return {
      ...withTree,
      showTree: true,
    };
  }

  const withoutTree = computeWidths(rows, now, tick, terminalColumns, false);
  return {
    ...withoutTree,
    showTree: false,
  };
};
