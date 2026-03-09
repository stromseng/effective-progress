import { Text } from "ink";
import type { TaskTreeInfo } from "../snapshot/types";
import { getTaskIndicator } from "../format";
import type { Column, RenderFrameContextValue } from "./node";
import { textWidth } from "./text-width";

const MIN_DESCRIPTION_WIDTH = 8;
const MIN_DESCRIPTION_WITH_TREE_WIDTH = 10;

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
  }, MIN_DESCRIPTION_WIDTH);

export const DescriptionColumn = (frame: RenderFrameContextValue): Column => {
  const treePreferred = Math.max(MIN_DESCRIPTION_WITH_TREE_WIDTH, maxDescriptionWidth(frame, true));
  const plainPreferred = Math.max(MIN_DESCRIPTION_WIDTH, maxDescriptionWidth(frame, false));
  const stickyKey = "description";
  const preferred = Math.max(
    Math.max(treePreferred, plainPreferred),
    frame.stickyWidths.get(stickyKey) ?? 0,
  );
  frame.stickyWidths.set(stickyKey, preferred);

  return {
    measure: {
      min: MIN_DESCRIPTION_WIDTH,
      preferred,
      max: preferred,
    },
    render: (taskId, width) => {
      const task = frame.getTask(taskId);
      const tree = frame.getTree(taskId);
      const showTree = width >= MIN_DESCRIPTION_WITH_TREE_WIDTH;
      const treePrefix = showTree ? renderTreePrefix(tree) : "";
      const indicator = getTaskIndicator(task, frame.tick);

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
