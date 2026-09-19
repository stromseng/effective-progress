// High-level API: wrap effects and collections in tasks.
export { task, all, forEach } from "./api";
export type {
  AllOptions,
  AllReturn,
  EffectAllExecutionOptions,
  EffectExecutionOptions,
  ForEachExecutionOptions,
  ForEachOptions,
} from "./api";
export type { TaskOptions } from "./tasks/options";

// Columns and cells: author custom columns and subscribe to the shared clocks.
export * as Columns from "./columns";
export type {
  AnyColumn,
  CellContext,
  Column,
  ColumnAlign,
  ColumnSizeValue,
  TaskRow,
  TaskRowDerived,
  TaskTreeInfo,
} from "./columns/types";
export { useNow } from "./renderer/now-clock";
export { useSpinnerTick } from "./renderer/spinner-clock";

// Task model: snapshots, units, and the typed handle.
export {
  TaskId,
  TaskCountDisplaySchema,
  TaskProgressSampleSchema,
  TaskSnapshotSchema,
  TaskStatusSchema,
  TaskUnitsSchema,
} from "./tasks/model";
export type {
  TaskCountDisplay,
  TaskProgressSample,
  TaskSnapshot,
  TaskStatus,
  TaskUnits,
} from "./tasks/model";
export type { TaskHandle } from "./tasks/task-handle";

// Service layer: provide or reuse the Progress service and operate on tasks by ID.
export { Progress, type ProgressService } from "./progress";
export { ProgressStdio, type ProgressStdioService } from "./stdio";
export { CurrentTask } from "./tasks/current-task";
export type { TaskOperations } from "./tasks/task-operations";
export type { AddTaskOptions, UpdateTaskOptions } from "./tasks/options";
export type { ProgressState, TaskOrderEntry } from "./store/state";
