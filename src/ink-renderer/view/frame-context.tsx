import { createContext, useContext } from "react";
import type { RenderFrameContextValue } from "../columns/node";
import type { TaskId, TaskSnapshot } from "../../types";
import type { TaskRowModel, TaskTreeInfo } from "../snapshot/types";

const RenderFrameContext = createContext<RenderFrameContextValue | null>(null);

export const RenderFrameProvider = RenderFrameContext.Provider;

export const useRenderFrameContext = (): RenderFrameContextValue => {
  const context = useContext(RenderFrameContext);
  if (context === null) {
    throw new Error("RenderFrameContext is not available.");
  }
  return context;
};

export const createRenderFrameContextValue = (
  rows: ReadonlyArray<TaskRowModel>,
  now: number,
  tick: number,
  isTTY: boolean,
  stickyWidths: Map<string, number>,
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
    isTTY,
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
