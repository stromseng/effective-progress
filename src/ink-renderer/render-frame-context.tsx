import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { TaskId, TaskSnapshot } from "../types";
import type { TaskRowModel, TaskTreeInfo } from "./store/types";

interface RenderFrameValue {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly taskIds: ReadonlyArray<TaskId>;
  readonly now: number;
  readonly tick: number;
  readonly getTask: (taskId: TaskId) => TaskSnapshot;
  readonly getTree: (taskId: TaskId) => TaskTreeInfo;
}

const RenderFrameContext = createContext<RenderFrameValue | undefined>(undefined);

interface RenderFrameProviderProps {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly now: number;
  readonly tick: number;
  readonly children: ReactNode;
}

export const RenderFrameProvider = ({ rows, now, tick, children }: RenderFrameProviderProps) => {
  const value = useMemo<RenderFrameValue>(() => {
    const tasks = new Map<TaskId, TaskSnapshot>();
    const trees = new Map<TaskId, TaskTreeInfo>();

    for (const row of rows) {
      tasks.set(row.task.id, row.task);
      trees.set(row.task.id, row.tree);
    }

    return {
      rows,
      taskIds: rows.map((row) => row.task.id),
      now,
      tick,
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
  }, [now, rows, tick]);

  return <RenderFrameContext.Provider value={value}>{children}</RenderFrameContext.Provider>;
};

export const useRenderFrame = (): RenderFrameValue => {
  const value = useContext(RenderFrameContext);
  if (value === undefined) {
    throw new Error("useRenderFrame must be used within a RenderFrameProvider.");
  }

  return value;
};
