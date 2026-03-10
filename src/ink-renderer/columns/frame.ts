import type { TaskId, TaskSnapshot } from "../../types";
import type { TaskRowModel, TaskTreeInfo } from "../snapshot/types";
import type { RenderFrameContextValue } from "./node";
import type { StickyWidthKey } from "./sticky-width";

export const createRenderFrame = (
  rows: ReadonlyArray<TaskRowModel>,
  now: number,
  tick: number,
  stickyWidths: Map<StickyWidthKey, number>,
): RenderFrameContextValue => {
  const tasks = new Map<TaskId, TaskSnapshot>();
  const trees = new Map<TaskId, TaskTreeInfo>();

  for (const row of rows) {
    tasks.set(row.task.id, row.task);
    trees.set(row.task.id, row.tree);
  }

  return {
    taskIds: rows.map((row) => row.task.id),
    now,
    tick,
    stickyWidths,
    getTask: (taskId) => {
      const task = tasks.get(taskId);
      if (task === undefined) {
        throw new Error(`Unknown task id: ${taskId as number}`);
      }
      return task;
    },
    getTree: (taskId) => {
      const tree = trees.get(taskId);
      if (tree === undefined) {
        throw new Error(`Unknown task tree: ${taskId as number}`);
      }
      return tree;
    },
  };
};
