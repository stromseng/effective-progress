import { Data, Hash } from "effect";
import type { ReactNode } from "react";
import type { TaskId, TaskSnapshot } from "../../types";
import type { TaskTreeInfo } from "../snapshot/types";
import type { StickyWidthKey } from "./sticky-width";

export interface WidthMeasure {
  readonly min: number;
  readonly preferred: number;
  readonly max?: number;
}

export interface RenderFrameContextValue {
  readonly taskIds: ReadonlyArray<TaskId>;
  readonly now: number;
  readonly tick: number;
  readonly stickyWidths: Map<StickyWidthKey, number>;
  readonly getTask: (taskId: TaskId) => TaskSnapshot;
  readonly getTree: (taskId: TaskId) => TaskTreeInfo;
}

export interface Column {
  readonly measure: WidthMeasure;
  readonly commitStickyWidth?: () => void;
  render: (taskId: TaskId, width: number) => ReactNode;
}

export interface ColumnDefinition {
  readonly id: string;
  build: (frame: RenderFrameContextValue) => Column | undefined;
}

export const createColumnDefinition = <TConfig extends Record<string, unknown>>(
  config: TConfig,
  create: (frame: RenderFrameContextValue, config: TConfig) => Column | undefined,
): ColumnDefinition => {
  const id = Hash.hash(Data.struct(config)).toString(36);
  return {
    id,
    build: (frame) => create(frame, config),
  };
};
