import { Brand, Data } from "effect";

export type TaskId = number & Brand.Brand<"TaskId">;
export const TaskId = Brand.nominal<TaskId>();

export type TaskStatus = "running" | "done" | "failed";

/** Whether the amount column shows only processed over total, or also the succeeded and failed counters. */
export type TaskCountDisplay = "processedOnly" | "detailed";

export interface TaskUnits {
  readonly succeeded: number;
  readonly failed: number;
  /** Always succeeded plus failed. */
  readonly processed: number;
  /** Absent when the total is unknown. */
  readonly total?: number;
}

/** One processed-count observation, kept in a rolling window for ETA estimation. */
export interface TaskProgressSample {
  readonly timestamp: number;
  readonly processed: number;
}

/** The readonly view of one task at one moment. Every store transition produces a new instance. */
export class TaskSnapshot extends Data.Class<{
  readonly id: TaskId;
  readonly parentId: TaskId | null;
  readonly description: string;
  readonly status: TaskStatus;
  readonly countDisplay: TaskCountDisplay;
  readonly transient: boolean;
  readonly units: TaskUnits;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly progressSamples: ReadonlyArray<TaskProgressSample>;
  readonly metadata: unknown;
}> {}

export const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: TaskUnits & { readonly total: number } } =>
  task.units.total !== undefined;
