import { Text } from "ink";
import type { TaskTreeInfo } from "../snapshot/types";
import { getTaskIndicator } from "../format";
import type { Column, RenderFrameContextValue } from "./node";
import { applyStickyWidth } from "./sticky-width";
import { textWidth } from "./text-width";

const MIN_PLAIN_DESCRIPTION_WIDTH = 8;
const MIN_COMPACT_DESCRIPTION_WIDTH = 3;
const MIN_SPINNER_WIDTH = 1;
const MIN_TREE_DESCRIPTION_TEXT_WIDTH = 6;

const treeAncestorPrefix = (tree: TaskTreeInfo): string =>
  tree.ancestorHasNextSibling
    .slice(1)
    .map((hasNext) => (hasNext ? "│  " : "   "))
    .join("");

const renderTreePrefix = (tree: TaskTreeInfo): string => {
  if (tree.depth <= 0) {
    return "";
  }

  const ancestor = treeAncestorPrefix(tree);
  return `${ancestor}${tree.hasNextSibling ? "├─ " : "└─ "}`;
};

const maxDescriptionWidth = (frame: RenderFrameContextValue, showTree: boolean): number =>
  frame.taskIds.reduce((max, taskId) => {
    const treePrefix = showTree ? renderTreePrefix(frame.getTree(taskId)) : "";
    return Math.max(max, textWidth(`${treePrefix}${frame.getTask(taskId).description}`) + 2);
  }, MIN_PLAIN_DESCRIPTION_WIDTH);

const minTreeDescriptionWidth = (frame: RenderFrameContextValue): number =>
  frame.taskIds.reduce((max, taskId) => {
    const treePrefixWidth = textWidth(renderTreePrefix(frame.getTree(taskId)));
    return Math.max(max, treePrefixWidth + 2 + MIN_TREE_DESCRIPTION_TEXT_WIDTH);
  }, MIN_PLAIN_DESCRIPTION_WIDTH);

export interface DescriptionColumnConfig {
  readonly variant?: "tree" | "plain" | "compact" | "spinner";
}

export const DescriptionColumn = (
  frame: RenderFrameContextValue,
  config: DescriptionColumnConfig = {},
): Column => {
  const variant = config.variant ?? "plain";
  const showTree = variant === "tree";
  const stickyKey =
    variant === "compact"
      ? "description.compact"
      : variant === "spinner"
        ? "description.spinner"
        : "description";
  const min =
    variant === "spinner"
      ? MIN_SPINNER_WIDTH
      : variant === "compact"
        ? MIN_COMPACT_DESCRIPTION_WIDTH
        : variant === "tree"
          ? minTreeDescriptionWidth(frame)
          : MIN_PLAIN_DESCRIPTION_WIDTH;
  const preferred =
    variant === "spinner" ? MIN_SPINNER_WIDTH : Math.max(min, maxDescriptionWidth(frame, showTree));
  const measure =
    variant === "spinner"
      ? {
          min,
          preferred,
          max: preferred,
        }
      : applyStickyWidth({
          key: stickyKey,
          measure: {
            min,
            preferred,
            max: preferred,
          },
          stickyWidths: frame.stickyWidths,
        });

  return {
    measure,
    render: (taskId) => {
      const task = frame.getTask(taskId);
      const tree = frame.getTree(taskId);
      const treePrefix = showTree ? renderTreePrefix(tree) : "";
      const indicator = getTaskIndicator(task, frame.tick);
      if (variant === "spinner") {
        return <Text color={indicator.color}>{indicator.symbol}</Text>;
      }

      return (
        <Text wrap="truncate-end">
          {treePrefix}
          <Text color={indicator.color}>{indicator.symbol}</Text>
          {` ${task.description}`}
        </Text>
      );
    },
  };
};
