import type { ReactNode } from "react";
import type { TaskId, TaskSnapshot } from "../../types";
import type { TaskTreeInfo } from "../snapshot/types";

export interface WidthMeasure {
  readonly min: number;
  readonly preferred: number;
  readonly max?: number;
}

export interface RenderFrameContextValue {
  readonly taskIds: ReadonlyArray<TaskId>;
  readonly now: number;
  readonly tick: number;
  readonly stickyWidths: Map<string, number>;
  readonly getTask: (taskId: TaskId) => TaskSnapshot;
  readonly getTree: (taskId: TaskId) => TaskTreeInfo;
}

export interface Column {
  readonly measure: WidthMeasure;
  render: (taskId: TaskId, width: number) => ReactNode;
}

export interface RootColumnSpec {
  readonly key: string;
  create: (frame: RenderFrameContextValue) => Column | undefined;
}
