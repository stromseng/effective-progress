import type { TaskStore } from "../../types";
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

const computeTreeInfo = (
  ordered: ReadonlyArray<OrderedTask>,
): ReadonlyArray<OrderedTask & { readonly tree: TaskRowModel["tree"] }> => {
  const hasNextSiblingByIndex: Array<boolean> = Array.from({ length: ordered.length }, () => false);

  for (let i = 0; i < ordered.length; i++) {
    const depth = ordered[i]!.depth;
    for (let j = i + 1; j < ordered.length; j++) {
      const candidateDepth = ordered[j]!.depth;
      if (candidateDepth < depth) {
        break;
      }
      if (candidateDepth === depth) {
        hasNextSiblingByIndex[i] = true;
        break;
      }
    }
  }

  const ancestorStateByDepth: Array<boolean> = [];

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

    ancestorStateByDepth[depth] = hasNextSiblingByIndex[index] ?? false;

    return {
      ...entry,
      tree,
    };
  });
};

export const toRenderSnapshot = (store: TaskStore): RenderSnapshot => {
  const visibleTasks = orderedVisibleTasks(store);
  const hasRunningTasks = visibleTasks.some((entry) => entry.snapshot.status === "running");

  return {
    rows: computeTreeInfo(visibleTasks).map((entry) => ({
      task: entry.snapshot,
      tree: entry.tree,
    })),
    hasRunningTasks,
  };
};
