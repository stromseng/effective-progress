import { Text } from "ink";
import { formatEta } from "../format";
import type { DeterminateTaskUnits, TaskSnapshot } from "../../types";
import type { TaskRowModel } from "../snapshot/types";
import type { ColumnPlanningContext } from "./planner";
import type { ColumnSpec } from "./spec";
import { textWidth } from "./spec";
import type { ColumnProps } from "./types";

interface EtaColumnProps extends ColumnProps {
  readonly mode: "prefixed" | "duration" | "primary";
}

const primaryUnit = (duration: string): string => duration.split(" ")[0] ?? duration;

const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: DeterminateTaskUnits } =>
  task.units._tag === "DeterminateTaskUnits";

const etaDurationText = (task: TaskSnapshot, now: number): string | undefined => {
  if (task.status !== "running" || !isDeterminate(task)) {
    return undefined;
  }

  const eta = formatEta(task, now);
  return eta.length > 0 ? eta : "--";
};

const EtaColumn = ({ task, now, mode }: EtaColumnProps) => {
  const duration = etaDurationText(task, now);
  if (duration === undefined) {
    return <Text />;
  }

  const text =
    mode === "prefixed"
      ? `ETA: ${duration}`
      : mode === "primary"
        ? primaryUnit(duration)
        : duration;

  return (
    <Text wrap="truncate-end" color="gray">
      {text}
    </Text>
  );
};

const RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR = Array.from("ETA: 59m 59s").length;

interface EtaMetrics {
  readonly hasEta: boolean;
  readonly prefixedWidth: number;
  readonly durationWidth: number;
  readonly primaryUnitWidth: number;
}

const computeEtaMetrics = (rows: ReadonlyArray<TaskRowModel>, now: number): EtaMetrics => {
  let hasEta = false;
  let prefixedWidth = 0;
  let durationWidth = 0;
  let primaryUnitWidth = 0;

  for (const row of rows) {
    const duration = etaDurationText(row.task, now);
    if (duration === undefined) {
      continue;
    }

    hasEta = true;
    const prefixed = `ETA: ${duration}`;
    prefixedWidth = Math.max(prefixedWidth, textWidth(prefixed));
    durationWidth = Math.max(durationWidth, textWidth(duration));
    primaryUnitWidth = Math.max(primaryUnitWidth, textWidth(primaryUnit(duration)));
  }

  return {
    hasEta,
    prefixedWidth,
    durationWidth: Math.max(2, durationWidth),
    primaryUnitWidth: Math.max(2, primaryUnitWidth),
  };
};

export const createEtaColumnSpec = (
  context: ColumnPlanningContext<TaskRowModel>,
  isTTY: boolean,
): ColumnSpec<TaskRowModel> | undefined => {
  const metrics = computeEtaMetrics(context.rows, context.now);
  if (!metrics.hasEta) {
    return undefined;
  }

  return {
    id: "eta",
    grow: 0,
    canHide: true,
    variants: [
      {
        id: "prefixed",
        minWidth: metrics.prefixedWidth,
        idealWidth: Math.max(metrics.prefixedWidth, RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR),
        renderCell: (row) => (
          <EtaColumn
            task={row.task}
            tree={row.tree}
            now={context.now}
            tick={context.tick}
            isTTY={isTTY}
            mode="prefixed"
          />
        ),
      },
      {
        id: "duration",
        minWidth: metrics.durationWidth,
        idealWidth: metrics.durationWidth,
        renderCell: (row) => (
          <EtaColumn
            task={row.task}
            tree={row.tree}
            now={context.now}
            tick={context.tick}
            isTTY={isTTY}
            mode="duration"
          />
        ),
      },
      {
        id: "primary",
        minWidth: metrics.primaryUnitWidth,
        idealWidth: metrics.primaryUnitWidth,
        renderCell: (row) => (
          <EtaColumn
            task={row.task}
            tree={row.tree}
            now={context.now}
            tick={context.tick}
            isTTY={isTTY}
            mode="primary"
          />
        ),
      },
    ],
  };
};
