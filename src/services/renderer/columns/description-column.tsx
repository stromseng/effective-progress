import cliSpinners, { type SpinnerName } from "cli-spinners";
import { Text } from "ink";
import type { CellInfo, TaskSnapshot } from "../../../types";
import { useSpinnerTick } from "../context/spinner-context";
import { isDeterminate } from "../shared/determinate";

const MIN_TREE_DESCRIPTION_TEXT_WIDTH = 6;
type TaskIndicatorColor = "green" | "yellow" | "red";

interface TaskIndicator {
  readonly symbol: string;
  readonly color: TaskIndicatorColor;
}

const DEFAULT_SPINNER_TYPE: SpinnerName = "dots";

const getSpinnerFrame = (tick: number, spinnerType: SpinnerName): string => {
  const frames = cliSpinners[spinnerType].frames;
  const frameIndex = ((tick % frames.length) + frames.length) % frames.length;
  return frames[frameIndex] ?? frames[0] ?? "";
};

export const getTaskIndicator = (
  task: TaskSnapshot,
  tick: number,
  spinnerType: SpinnerName = DEFAULT_SPINNER_TYPE,
): TaskIndicator => {
  if (task.status === "running") {
    return {
      symbol: getSpinnerFrame(tick, spinnerType),
      color: "yellow",
    };
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

export interface DescriptionPrepared {
  readonly minTreeWidth: number;
  readonly preferredWidth: number;
}

export const prepareDescription = (
  rows: ReadonlyArray<CellInfo<unknown>>,
): DescriptionPrepared => ({
  minTreeWidth: rows.reduce(
    (max, row) => Math.max(max, row.derived.treePrefixWidth + 2 + MIN_TREE_DESCRIPTION_TEXT_WIDTH),
    MIN_TREE_DESCRIPTION_TEXT_WIDTH + 2,
  ),
  preferredWidth: rows.reduce(
    (max, row) => Math.max(max, row.derived.treePrefixWidth + 2 + row.derived.descriptionWidth),
    2,
  ),
});

const TaskIndicatorGlyph = ({
  task,
  spinnerType = DEFAULT_SPINNER_TYPE,
}: {
  readonly task: TaskSnapshot;
  readonly spinnerType?: SpinnerName;
}) => {
  const tick = useSpinnerTick(task.status === "running");
  const indicator = getTaskIndicator(task, tick, spinnerType);

  return <Text color={indicator.color}>{indicator.symbol}</Text>;
};

export const DescriptionCell = ({
  cell,
  width,
  minTreeWidth,
}: {
  readonly cell: CellInfo<unknown>;
  readonly width: number | undefined;
  readonly minTreeWidth: number;
}) => {
  const showTree = width === undefined || width >= minTreeWidth;
  const treePrefix = showTree ? cell.derived.treePrefix : "";

  if (!showTree && width !== undefined && width <= 1) {
    return <TaskIndicatorGlyph task={cell.task} />;
  }

  if (!showTree && width !== undefined && width === 2) {
    return (
      <Text wrap="truncate-end">
        <TaskIndicatorGlyph task={cell.task} />…
      </Text>
    );
  }

  return (
    <Text wrap="truncate-end">
      {treePrefix}
      <TaskIndicatorGlyph task={cell.task} />
      {` ${cell.task.description}`}
    </Text>
  );
};
