import type { TaskStore } from "../types";
import type { OrderedTask, TaskRowModel } from "./types";
import { computeTreeInfo } from "./tree";

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
