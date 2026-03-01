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

export const toTaskRows = (store: TaskStore): ReadonlyArray<TaskRowModel> =>
  computeTreeInfo(orderedVisibleTasks(store)).map((entry) => ({
    task: entry.snapshot,
    tree: entry.tree,
  }));
