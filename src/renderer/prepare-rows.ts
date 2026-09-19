import type { ProgressState } from "../store/state";
import { textWidth } from "../terminal/text-width";
import type { TaskRow } from "../columns/types";

interface OrderedTask {
  readonly snapshot: TaskRow["task"];
  readonly depth: number;
}

const orderedVisibleTasks = (state: ProgressState): ReadonlyArray<OrderedTask> =>
  state.renderOrder.flatMap((row) => {
    const snapshot = state.tasks.get(row.id);
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

export interface RenderView {
  readonly rows: ReadonlyArray<TaskRow>;
  readonly hasRunningTasks: boolean;
}

const treeAncestorPrefix = (ancestorHasNextSibling: ReadonlyArray<boolean>): string =>
  ancestorHasNextSibling
    .slice(1)
    .map((hasNextSibling) => (hasNextSibling ? "│  " : "   "))
    .join("");

const renderTreePrefix = (tree: TaskRow["tree"]): string => {
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

const sameTreePrefixInputs = (left: TaskRow["tree"], right: TaskRow["tree"]): boolean =>
  left.depth === right.depth &&
  left.hasNextSibling === right.hasNextSibling &&
  arraysEqual(left.ancestorHasNextSibling, right.ancestorHasNextSibling);

const deriveRow = (
  task: OrderedTask["snapshot"],
  treePrefix: string,
  previousRow: TaskRow | undefined,
): TaskRow["derived"] => {
  // Tree prefixes are built from fixed box-drawing glyphs we treat as single-cell.
  const treePrefixWidth = treePrefix.length;
  const descriptionWidth =
    previousRow !== undefined && previousRow.task.description === task.description
      ? previousRow.derived.descriptionWidth
      : textWidth(task.description);

  return { treePrefix, treePrefixWidth, descriptionWidth };
};

const buildTaskRows = (
  ordered: ReadonlyArray<OrderedTask>,
  previousRows: ReadonlyArray<TaskRow>,
): ReadonlyArray<TaskRow> => {
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

    const tree = {
      depth,
      hasNextSibling: hasNextSiblingByIndex[index] ?? false,
      ancestorHasNextSibling: [...ancestorStateByDepth],
    };
    const previousRow = previousRowsByTaskId.get(entry.snapshot.id);

    ancestorStateByDepth[depth] = hasNextSiblingByIndex[index] ?? false;

    const treeUnchanged = previousRow !== undefined && sameTreePrefixInputs(previousRow.tree, tree);

    if (treeUnchanged && previousRow.task === entry.snapshot) {
      return previousRow;
    }

    return {
      task: entry.snapshot,
      tree: treeUnchanged ? previousRow.tree : tree,
      derived: deriveRow(
        entry.snapshot,
        treeUnchanged ? previousRow.derived.treePrefix : renderTreePrefix(tree),
        previousRow,
      ),
    };
  });
};

export const prepareRows = (state: ProgressState, previousView?: RenderView): RenderView => {
  const visibleTasks = orderedVisibleTasks(state);
  const hasRunningTasks = visibleTasks.some((entry) => entry.snapshot.status === "running");

  return {
    rows: buildTaskRows(visibleTasks, previousView?.rows ?? []),
    hasRunningTasks,
  };
};
