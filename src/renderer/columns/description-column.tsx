import cliSpinners, { type SpinnerName } from "cli-spinners";
import { Box, Text, useBoxMetrics, type DOMElement } from "ink";
import { useRef } from "react";
import type { TaskSnapshot } from "../../types";
import { useSpinnerTick } from "../context/spinner-context";
import type { TaskRowModel } from "../store/types";

const MIN_TREE_DESCRIPTION_TEXT_WIDTH = 6;
type TaskIndicatorColor = "green" | "yellow" | "red";

interface TaskIndicator {
  readonly symbol: string;
  readonly color: TaskIndicatorColor;
}

const DEFAULT_SPINNER_TYPE: SpinnerName = "dots";

const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: TaskSnapshot["units"] & { readonly total: number } } =>
  task.units.total !== undefined;

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

const TaskIndicatorGlyph = ({
  task,
  spinnerType = DEFAULT_SPINNER_TYPE,
}: {
  readonly task: TaskSnapshot;
  readonly spinnerType?: SpinnerName;
}) => {
  const tick = useSpinnerTick();
  const indicator = getTaskIndicator(task, tick, spinnerType);

  return <Text color={indicator.color}>{indicator.symbol}</Text>;
};

const DescriptionCell = ({
  row,
  width,
  minTreeWidth,
}: {
  readonly row: TaskRowModel;
  readonly width: number | undefined;
  readonly minTreeWidth: number;
}) => {
  const showTree = width === undefined || width >= minTreeWidth;
  const treePrefix = showTree ? row.derived.treePrefix : "";

  if (!showTree && width !== undefined && width <= 1) {
    return <TaskIndicatorGlyph task={row.task} />;
  }

  if (!showTree && width !== undefined && width === 2) {
    return (
      <Text wrap="truncate-end">
        <TaskIndicatorGlyph task={row.task} />…
      </Text>
    );
  }

  return (
    <Text wrap="truncate-end">
      {treePrefix}
      <TaskIndicatorGlyph task={row.task} />
      {` ${row.task.description}`}
    </Text>
  );
};

export const DescriptionColumn = ({ rows }: { readonly rows: ReadonlyArray<TaskRowModel> }) => {
  const ref = useRef<DOMElement>(null);
  const { width, hasMeasured } = useBoxMetrics(ref);

  const minTreeWidth = rows.reduce(
    (max, row) => Math.max(max, row.derived.treePrefixWidth + 2 + MIN_TREE_DESCRIPTION_TEXT_WIDTH),
    MIN_TREE_DESCRIPTION_TEXT_WIDTH + 2,
  );

  return (
    <Box ref={ref} flexDirection="column" flexGrow={1} flexShrink={1} minWidth={1}>
      {rows.map((row) => (
        <Box key={row.task.id as number} height={1}>
          <DescriptionCell
            row={row}
            width={hasMeasured ? width : undefined}
            minTreeWidth={minTreeWidth}
          />
        </Box>
      ))}
    </Box>
  );
};
