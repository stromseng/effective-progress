import { type DeterminateTaskUnits, type TaskSnapshot } from "../../types";
import type { TaskRowModel } from "../types";
import { formatAmount, formatElapsed, formatEta } from "../format";
import { renderTreePrefix } from "../tree";
import { AmountColumn, type AmountLayout } from "./amount-column";
import { BarColumn } from "./bar-column";
import { DescriptionColumn } from "./description-column";
import { ElapsedColumn } from "./elapsed-column";
import { EtaColumn } from "./eta-column";
import {
  planColumns,
  type ColumnPlan,
  type ColumnPlanningContext,
  type ResolvedColumn,
} from "./planner";

export const DEFAULT_BAR_WIDTH = 30;
const MIN_DESCRIPTION_WIDTH = 8;
const MIN_DESCRIPTION_WITH_TREE_WIDTH = 24;
const MIN_BAR_WIDTH = 8;
const MIN_ELAPSED_WIDTH = 2;
const BASELINE_ROW_WIDTH = 150;
const RESERVED_ELAPSED_WIDTH_UP_TO_ONE_HOUR = Array.from("59m 59s").length;
const RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR = Array.from("ETA: 59m 59s").length;

const textWidth = (text: string): number => Array.from(text).length;

const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: DeterminateTaskUnits } =>
  task.units._tag === "DeterminateTaskUnits";

const hasDeterminateRows = (rows: ReadonlyArray<TaskRowModel>): boolean =>
  rows.some((row) => isDeterminate(row.task));

const maxDescriptionWidth = (rows: ReadonlyArray<TaskRowModel>, showTree: boolean): number =>
  rows.reduce((max, row) => {
    const treePrefix = showTree ? renderTreePrefix(row.tree) : "";
    return Math.max(max, textWidth(`${treePrefix}${row.task.description}`) + 2);
  }, MIN_DESCRIPTION_WIDTH);

const maxElapsedWidth = (rows: ReadonlyArray<TaskRowModel>, now: number): number =>
  rows.reduce(
    (max, row) => Math.max(max, textWidth(formatElapsed(row.task, now))),
    MIN_ELAPSED_WIDTH,
  );

const maxEtaContentWidth = (rows: ReadonlyArray<TaskRowModel>, now: number): number =>
  rows.reduce((max, row) => {
    const { task } = row;
    if (task.status !== "running" || !isDeterminate(task)) {
      return max;
    }
    const etaValue = formatEta(task, now);
    const etaText = `ETA: ${etaValue.length > 0 ? etaValue : "--"}`;
    return Math.max(max, textWidth(etaText));
  }, 0);

interface AmountMetrics {
  readonly hasDeterminate: boolean;
  readonly hasDetailed: boolean;
  readonly totalDigits: number;
  readonly simpleTextWidth: number;
}

const computeAmountMetrics = (rows: ReadonlyArray<TaskRowModel>, tick: number): AmountMetrics => {
  let hasDeterminate = false;
  let hasDetailed = false;
  let totalDigits = 0;
  let simpleTextWidth = 0;

  for (const row of rows) {
    const { task } = row;
    if (isDeterminate(task)) {
      hasDeterminate = true;
      totalDigits = Math.max(totalDigits, textWidth(`${task.units.total}`));
      if (task.countDisplay === "detailed") {
        hasDetailed = true;
      }
      continue;
    }

    simpleTextWidth = Math.max(simpleTextWidth, textWidth(formatAmount(task, tick)));
  }

  return {
    hasDeterminate,
    hasDetailed,
    totalDigits: Math.max(1, totalDigits),
    simpleTextWidth,
  };
};

const structuredAmountLayout = (metrics: AmountMetrics): AmountLayout => ({
  kind: "structured",
  succeededWidth: metrics.hasDetailed ? metrics.totalDigits : 0,
  failedWidth: metrics.hasDetailed ? metrics.totalDigits : 0,
  processedWidth: metrics.totalDigits,
  totalWidth: metrics.totalDigits,
});

const compactAmountLayout = (metrics: AmountMetrics): AmountLayout => ({
  kind: "structured",
  succeededWidth: 0,
  failedWidth: 0,
  processedWidth: metrics.totalDigits,
  totalWidth: metrics.totalDigits,
});

const structuredAmountWidth = (metrics: AmountMetrics): number =>
  metrics.totalDigits +
  1 +
  metrics.totalDigits +
  (metrics.hasDetailed ? metrics.totalDigits + 1 + metrics.totalDigits + 1 : 0);

const compactAmountWidth = (metrics: AmountMetrics): number =>
  metrics.totalDigits + 1 + metrics.totalDigits;

const buildColumns = (
  context: ColumnPlanningContext<TaskRowModel>,
  isTTY: boolean,
): Array<ResolvedColumn<TaskRowModel>> => {
  const rows = context.rows;
  const determinate = hasDeterminateRows(rows);
  const descriptionTreeIdeal = maxDescriptionWidth(rows, true);
  const descriptionPlainIdeal = maxDescriptionWidth(rows, false);
  const elapsedContentWidth = maxElapsedWidth(rows, context.now);
  const etaContentWidth = maxEtaContentWidth(rows, context.now);
  const amountMetrics = computeAmountMetrics(rows, context.tick);

  const columns: Array<ResolvedColumn<TaskRowModel>> = [
    {
      id: "description",
      grow: 1,
      canHide: false,
      variants: [
        {
          id: "tree",
          minWidth: MIN_DESCRIPTION_WITH_TREE_WIDTH,
          idealWidth: Math.max(MIN_DESCRIPTION_WITH_TREE_WIDTH, descriptionTreeIdeal),
          shrinkResistance: 95,
          demoteResistance: 10,
          hideResistance: 1_000,
          renderCell: (row) => (
            <DescriptionColumn
              task={row.task}
              tree={row.tree}
              now={context.now}
              tick={context.tick}
              isTTY={isTTY}
              showTree={true}
            />
          ),
        },
        {
          id: "plain",
          minWidth: MIN_DESCRIPTION_WIDTH,
          idealWidth: Math.max(MIN_DESCRIPTION_WIDTH, descriptionPlainIdeal),
          shrinkResistance: 100,
          demoteResistance: 1_000,
          hideResistance: 1_000,
          renderCell: (row) => (
            <DescriptionColumn
              task={row.task}
              tree={row.tree}
              now={context.now}
              tick={context.tick}
              isTTY={isTTY}
              showTree={false}
            />
          ),
        },
      ],
    },
    {
      id: "elapsed",
      grow: 0,
      canHide: false,
      variants: [
        {
          id: "stable",
          minWidth: elapsedContentWidth,
          idealWidth: determinate
            ? Math.max(elapsedContentWidth, RESERVED_ELAPSED_WIDTH_UP_TO_ONE_HOUR)
            : elapsedContentWidth,
          shrinkResistance: 5,
          demoteResistance: 15,
          hideResistance: 1_000,
          renderCell: (row) => (
            <ElapsedColumn
              task={row.task}
              tree={row.tree}
              now={context.now}
              tick={context.tick}
              isTTY={isTTY}
            />
          ),
        },
        {
          id: "compact",
          minWidth: MIN_ELAPSED_WIDTH,
          idealWidth: elapsedContentWidth,
          shrinkResistance: 65,
          demoteResistance: 1_000,
          hideResistance: 1_000,
          renderCell: (row) => (
            <ElapsedColumn
              task={row.task}
              tree={row.tree}
              now={context.now}
              tick={context.tick}
              isTTY={isTTY}
            />
          ),
        },
      ],
    },
  ];

  if (determinate) {
    columns.splice(1, 0, {
      id: "bar",
      grow: 0,
      canHide: true,
      variants: [
        {
          id: "full",
          minWidth: MIN_BAR_WIDTH,
          idealWidth: DEFAULT_BAR_WIDTH,
          shrinkResistance: 20,
          demoteResistance: 50,
          hideResistance: 40,
          renderCell: (row, width) => (
            <BarColumn
              task={row.task}
              tree={row.tree}
              now={context.now}
              tick={context.tick}
              isTTY={isTTY}
              width={Math.max(1, Math.min(width, DEFAULT_BAR_WIDTH))}
            />
          ),
        },
        {
          id: "compact",
          minWidth: 1,
          idealWidth: MIN_BAR_WIDTH,
          shrinkResistance: 18,
          demoteResistance: 1_000,
          hideResistance: 45,
          renderCell: (row, width) => (
            <BarColumn
              task={row.task}
              tree={row.tree}
              now={context.now}
              tick={context.tick}
              isTTY={isTTY}
              width={Math.max(1, width)}
            />
          ),
        },
      ],
    });
  }

  if (amountMetrics.hasDeterminate || amountMetrics.simpleTextWidth > 0) {
    const detailedLayout = structuredAmountLayout(amountMetrics);
    const processedLayout = compactAmountLayout(amountMetrics);
    const detailedWidth = structuredAmountWidth(amountMetrics);
    const processedWidth = compactAmountWidth(amountMetrics);

    const amountVariants =
      amountMetrics.hasDeterminate && amountMetrics.hasDetailed
        ? [
            {
              id: "detailed",
              minWidth: detailedWidth,
              idealWidth: detailedWidth,
              shrinkResistance: 98,
              demoteResistance: 35,
              hideResistance: 120,
              renderCell: (row: TaskRowModel) => (
                <AmountColumn task={row.task} tick={context.tick} layout={detailedLayout} />
              ),
            },
            {
              id: "processed",
              minWidth: processedWidth,
              idealWidth: processedWidth,
              shrinkResistance: 98,
              demoteResistance: 1_000,
              hideResistance: 120,
              renderCell: (row: TaskRowModel) => (
                <AmountColumn task={row.task} tick={context.tick} layout={processedLayout} />
              ),
            },
          ]
        : amountMetrics.hasDeterminate
          ? [
              {
                id: "processed",
                minWidth: processedWidth,
                idealWidth: processedWidth,
                shrinkResistance: 98,
                demoteResistance: 1_000,
                hideResistance: 120,
                renderCell: (row: TaskRowModel) => (
                  <AmountColumn task={row.task} tick={context.tick} layout={processedLayout} />
                ),
              },
            ]
          : [
              {
                id: "text",
                minWidth: 0,
                idealWidth: amountMetrics.simpleTextWidth,
                shrinkResistance: 50,
                demoteResistance: 1_000,
                hideResistance: 60,
                renderCell: (row: TaskRowModel) => (
                  <AmountColumn task={row.task} tick={context.tick} layout={{ kind: "text" }} />
                ),
              },
            ];

    columns.splice(determinate ? 2 : 1, 0, {
      id: "amount",
      grow: 0,
      canHide: true,
      variants: amountVariants,
    });
  }

  if (etaContentWidth > 0) {
    columns.push({
      id: "eta",
      grow: 0,
      canHide: true,
      variants: [
        {
          id: "stable",
          minWidth: etaContentWidth,
          idealWidth: Math.max(etaContentWidth, RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR),
          shrinkResistance: 1,
          demoteResistance: 12,
          hideResistance: 15,
          renderCell: (row) => (
            <EtaColumn
              task={row.task}
              tree={row.tree}
              now={context.now}
              tick={context.tick}
              isTTY={isTTY}
            />
          ),
        },
        {
          id: "compact",
          minWidth: 1,
          idealWidth: etaContentWidth,
          shrinkResistance: 15,
          demoteResistance: 1_000,
          hideResistance: 10,
          renderCell: (row) => (
            <EtaColumn
              task={row.task}
              tree={row.tree}
              now={context.now}
              tick={context.tick}
              isTTY={isTTY}
            />
          ),
        },
      ],
    });
  }

  return columns;
};

export interface FrameLayout extends ColumnPlan<TaskRowModel> {}

export const computeFrameLayout = (
  rows: ReadonlyArray<TaskRowModel>,
  now: number,
  tick: number,
  terminalColumns: number | undefined,
  isTTY: boolean,
): FrameLayout => {
  const context: ColumnPlanningContext<TaskRowModel> = {
    rows,
    now,
    tick,
    terminalColumns,
  };
  const columns = buildColumns(context, isTTY);

  return planColumns({
    context,
    columns,
    baselineWidth: hasDeterminateRows(rows) ? BASELINE_ROW_WIDTH : 1,
  });
};
