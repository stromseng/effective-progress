import type { CellInfo, ColumnDef, TaskSnapshot } from "../types";
import { Text } from "ink";
import { isDeterminate } from "../renderer/shared/determinate";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export interface BarPrepared {
  readonly hasDeterminateRows: boolean;
}

const prepareBar = (rows: ReadonlyArray<CellInfo<unknown>>): BarPrepared => {
  return {
    hasDeterminateRows: rows.some((row) => row.derived.isDeterminate),
  };
};

const ProgressBarSegments = ({
  task,
  width,
}: {
  readonly task: TaskSnapshot;
  readonly width: number;
}) => {
  if (!isDeterminate(task)) {
    return <Text>{` `.repeat(Math.max(0, width))}</Text>;
  }

  const displayTotal = Math.max(task.units.total, task.units.succeeded + task.units.failed);
  const succeededEnd =
    displayTotal === 0 ? width : Math.round((task.units.succeeded / displayTotal) * width);
  const failedEnd =
    displayTotal === 0
      ? width
      : Math.round(((task.units.succeeded + task.units.failed) / displayTotal) * width);
  const succeededLength = clamp(succeededEnd, 0, width);
  const failedLength = clamp(failedEnd, succeededLength, width) - succeededLength;
  const remainingLength = Math.max(0, width - succeededLength - failedLength);

  return (
    <Text wrap="truncate-end">
      <Text color="green">{"━".repeat(succeededLength)}</Text>
      <Text color="red">{"━".repeat(failedLength)}</Text>
      <Text color="gray">{"─".repeat(remainingLength)}</Text>
    </Text>
  );
};

const BarCell = ({ task, width }: { readonly task: TaskSnapshot; readonly width?: number }) => (
  <Text wrap="truncate-end">
    <ProgressBarSegments task={task} width={width ?? 0} />
  </Text>
);

export interface BarOptions {
  readonly size?: number | "fullwidth";
}

const DEFAULT_BAR_SIZE = 30;

const resolveBarSize = (size: number | "fullwidth" | undefined): number | "fullwidth" => {
  if (size === "fullwidth") {
    return size;
  }

  if (size === undefined || !Number.isFinite(size)) {
    return DEFAULT_BAR_SIZE;
  }

  return Math.max(1, Math.floor(size));
};

export const bar = ({ size }: BarOptions = {}): ColumnDef<unknown, BarPrepared> => {
  const resolvedSize = resolveBarSize(size);

  return {
    prepare: prepareBar,
    flexGrow: (prepared) => (prepared.hasDeterminateRows && resolvedSize === "fullwidth" ? 1 : 0),
    flexShrink: (prepared) => (prepared.hasDeterminateRows ? 1 : 0),
    flexBasis: (prepared) =>
      prepared.hasDeterminateRows
        ? resolvedSize === "fullwidth"
          ? DEFAULT_BAR_SIZE
          : resolvedSize
        : 0,
    minWidth: (prepared) =>
      prepared.hasDeterminateRows ? (resolvedSize === "fullwidth" ? 4 : resolvedSize) : 0,
    render: ({ task }, ctx) => <BarCell task={task} width={ctx.width} />,
  };
};
