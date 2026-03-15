import type { TaskStore } from "../../types";
import { textWidth } from "../shared/text-width";
import type { OrderedTask, TaskRowModel } from "./types";

const orderedVisibleTasks = (store: TaskStore): ReadonlyArray<OrderedTask> =>
  store.renderOrder.flatMap((row) => {
    const snapshot = store.tasks.get(row.id);
    if (!snapshot || (snapshot.transient && snapshot.status !== "running")) {
      return [];
    }

    return [
      {
        snapshot,
        depth: row.depth,
      },
    ];
  });

export interface RenderSnapshot {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly hasRunningTasks: boolean;
}

const treeAncestorPrefix = (ancestorHasNextSibling: ReadonlyArray<boolean>): string =>
  ancestorHasNextSibling
    .slice(1)
    .map((hasNextSibling) => (hasNextSibling ? "│  " : "   "))
    .join("");

const renderTreePrefix = (tree: TaskRowModel["tree"]): string => {
  if (tree.depth <= 0) {
    return "";
  }

  return `${treeAncestorPrefix(tree.ancestorHasNextSibling)}${tree.hasNextSibling ? "├─ " : "└─ "}`;
};

const arraysEqual = (left: ReadonlyArray<boolean>, right: ReadonlyArray<boolean>): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }

  return true;
};

const sameTreePrefixInputs = (left: TaskRowModel["tree"], right: TaskRowModel["tree"]): boolean =>
  left.depth === right.depth &&
  left.hasNextSibling === right.hasNextSibling &&
  arraysEqual(left.ancestorHasNextSibling, right.ancestorHasNextSibling);

const sameTree = (left: TaskRowModel["tree"], right: TaskRowModel["tree"]): boolean =>
  sameTreePrefixInputs(left, right) && left.hasChildren === right.hasChildren;

const deriveRow = (
  task: OrderedTask["snapshot"],
  tree: TaskRowModel["tree"],
  previousRow: TaskRowModel | undefined,
): TaskRowModel["derived"] => {
  if (previousRow !== undefined && previousRow.task === task && sameTree(previousRow.tree, tree)) {
    return previousRow.derived;
  }

  const treePrefix =
    previousRow !== undefined && sameTreePrefixInputs(previousRow.tree, tree)
      ? previousRow.derived.treePrefix
      : renderTreePrefix(tree);
  const treePrefixWidth =
    previousRow !== undefined && sameTreePrefixInputs(previousRow.tree, tree)
      ? previousRow.derived.treePrefixWidth
      : // Tree prefixes are built from fixed box-drawing glyphs we treat as single-cell.
        treePrefix.length;

  const descriptionWidth =
    previousRow !== undefined && previousRow.task.description === task.description
      ? previousRow.derived.descriptionWidth
      : textWidth(task.description);

  const isDeterminate =
    previousRow !== undefined && previousRow.task.units.total === task.units.total
      ? previousRow.derived.isDeterminate
      : task.units.total !== undefined;

  const hasRenderableProgress =
    previousRow !== undefined &&
    previousRow.task.units.total === task.units.total &&
    previousRow.task.units.processed === task.units.processed
      ? previousRow.derived.hasRenderableProgress
      : task.units.total !== undefined || task.units.processed > 0;

  return {
    treePrefix,
    treePrefixWidth,
    descriptionWidth,
    treePrefixedDescriptionWidth: treePrefixWidth + descriptionWidth,
    hasRenderableProgress,
    isDeterminate,
  };
};

const computeTreeInfo = (
  ordered: ReadonlyArray<OrderedTask>,
  previousRows: ReadonlyArray<TaskRowModel>,
): ReadonlyArray<TaskRowModel> => {
  const hasNextSiblingByIndex: Array<boolean> = Array.from({ length: ordered.length }, () => false);
  const seenByDepth: Array<boolean> = [];
  for (let i = ordered.length - 1; i >= 0; i--) {
    const depth = ordered[i]!.depth;
    hasNextSiblingByIndex[i] = seenByDepth[depth] ?? false;
    seenByDepth[depth] = true;
    seenByDepth.length = depth + 1;
  }

  const ancestorStateByDepth: Array<boolean> = [];
  const previousRowsByTaskId = new Map(previousRows.map((row) => [row.task.id, row] as const));

  return ordered.map((entry, index) => {
    const depth = entry.depth;
    ancestorStateByDepth.length = depth;

    const hasChildren =
      index + 1 < ordered.length &&
      ordered[index + 1] !== undefined &&
      ordered[index + 1]!.depth > depth;

    const tree = {
      depth,
      hasNextSibling: hasNextSiblingByIndex[index] ?? false,
      hasChildren,
      ancestorHasNextSibling: [...ancestorStateByDepth],
    };
    const previousRow = previousRowsByTaskId.get(entry.snapshot.id);

    ancestorStateByDepth[depth] = hasNextSiblingByIndex[index] ?? false;

    if (
      previousRow !== undefined &&
      previousRow.task === entry.snapshot &&
      sameTree(previousRow.tree, tree)
    ) {
      return previousRow;
    }

    const derived = deriveRow(entry.snapshot, tree, previousRow);

    return {
      task: entry.snapshot,
      tree: previousRow !== undefined && sameTree(previousRow.tree, tree) ? previousRow.tree : tree,
      derived,
    };
  });
};

export const toRenderSnapshot = (
  store: TaskStore,
  previousSnapshot?: RenderSnapshot,
): RenderSnapshot => {
  const visibleTasks = orderedVisibleTasks(store);
  const hasRunningTasks = visibleTasks.some((entry) => entry.snapshot.status === "running");

  return {
    rows: computeTreeInfo(visibleTasks, previousSnapshot?.rows ?? []),
    hasRunningTasks,
  };
};
