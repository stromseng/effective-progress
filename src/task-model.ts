import { Brand, Schema } from "effect";

const TaskIdSchema = Schema.Number.pipe(Schema.brand("TaskId"));

export type TaskId = typeof TaskIdSchema.Type;
export const TaskId = Brand.nominal<TaskId>();

export const TaskStatusSchema = Schema.Literals(["running", "done", "failed"]);

export type TaskStatus = typeof TaskStatusSchema.Type;
export const TaskCountDisplaySchema = Schema.Literals(["processedOnly", "detailed"]);
export type TaskCountDisplay = typeof TaskCountDisplaySchema.Type;
export const TaskUnitsSchema = Schema.Struct({
  succeeded: Schema.Number,
  failed: Schema.Number,
  processed: Schema.Number,
  total: Schema.optional(Schema.Number),
});

export type TaskUnits = typeof TaskUnitsSchema.Type;

// A processed-count observation used to estimate ETA from recent throughput.
export const TaskProgressSampleSchema = Schema.Struct({
  timestamp: Schema.Number,
  processed: Schema.Number,
});

export type TaskProgressSample = typeof TaskProgressSampleSchema.Type;

export const TaskSnapshotSchema = Schema.Struct({
  id: TaskIdSchema,
  parentId: Schema.NullOr(TaskIdSchema),
  description: Schema.String,
  status: TaskStatusSchema,
  countDisplay: TaskCountDisplaySchema,
  transient: Schema.Boolean,
  units: TaskUnitsSchema,
  startedAt: Schema.Number,
  completedAt: Schema.NullOr(Schema.Number),
  progressSamples: Schema.Array(TaskProgressSampleSchema),
  metadata: Schema.Unknown,
});

export type TaskSnapshot = typeof TaskSnapshotSchema.Type;
