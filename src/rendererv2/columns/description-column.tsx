import cliSpinners, { type SpinnerName } from "cli-spinners";
import { Text } from "ink";
import type { TaskSnapshot } from "../../types";
import { useSpinnerTick } from "../context/spinner-context";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api";

interface DescriptionColumnConfig {
  readonly minWidth: number;
  readonly spinnerType: SpinnerName;
  readonly sticky: boolean;
  readonly stickyMaxWidth?: number;
}

const MIN_TREE_DESCRIPTION_TEXT_WIDTH = 6;
type TaskIndicatorColor = "green" | "yellow" | "red";

interface TaskIndicator {
  readonly symbol: string;
  readonly color: TaskIndicatorColor;
}

const defaultDescriptionColumnConfig = {
  minWidth: 1,
  spinnerType: "dots",
  sticky: true,
} satisfies DescriptionColumnConfig;

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
  spinnerType: SpinnerName = defaultDescriptionColumnConfig.spinnerType,
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
  spinnerType = defaultDescriptionColumnConfig.spinnerType,
}: {
  readonly task: TaskSnapshot;
  readonly spinnerType?: SpinnerName;
}) => {
  const tick = useSpinnerTick();
  const indicator = getTaskIndicator(task, tick, spinnerType);

  return <Text color={indicator.color}>{indicator.symbol}</Text>;
};

export const createDescriptionColumn = (
  config?: Partial<DescriptionColumnConfig>,
): ProgressColumnDefinition => {
  const resolvedConfig = {
    ...defaultDescriptionColumnConfig,
    ...config,
    spinnerType: config?.spinnerType ?? defaultDescriptionColumnConfig.spinnerType,
  } satisfies DescriptionColumnConfig;
  let minTreeWidth = MIN_TREE_DESCRIPTION_TEXT_WIDTH + 2;

  const Component = ({ row, width }: ProgressColumnProps) => {
    const showTree = width >= minTreeWidth;
    const treePrefix = showTree ? row.derived.treePrefix : "";

    if (!showTree && width <= 1) {
      return <TaskIndicatorGlyph task={row.task} spinnerType={resolvedConfig.spinnerType} />;
    }

    if (!showTree && width === 2) {
      return (
        <Text wrap="truncate-end">
          <TaskIndicatorGlyph task={row.task} spinnerType={resolvedConfig.spinnerType} />…
        </Text>
      );
    }

    return (
      <Text wrap="truncate-end">
        {treePrefix}
        <TaskIndicatorGlyph task={row.task} spinnerType={resolvedConfig.spinnerType} />
        {` ${row.task.description}`}
      </Text>
    );
  };

  return {
    Component,
    measure: ({ rows }): ProgressColumnMeasurement => {
      const hasNestedRows = rows.some((row) => row.tree.depth > 0);

      minTreeWidth = rows.reduce(
        (max, row) =>
          Math.max(max, row.derived.treePrefixWidth + 2 + MIN_TREE_DESCRIPTION_TEXT_WIDTH),
        MIN_TREE_DESCRIPTION_TEXT_WIDTH + 2,
      );

      return {
        minWidth: resolvedConfig.minWidth,
        preferredWidth: Math.max(
          rows.reduce(
            (max, row) => Math.max(max, row.derived.treePrefixedDescriptionWidth + 2),
            resolvedConfig.minWidth,
          ),
          hasNestedRows ? minTreeWidth : resolvedConfig.minWidth,
        ),
        maxWidth: undefined,
      };
    },
    noWrap: false,
    sticky: resolvedConfig.sticky,
    stickyMaxWidth: resolvedConfig.stickyMaxWidth,
  };
};
