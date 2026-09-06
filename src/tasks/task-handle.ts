import type { Effect } from "effect";
import type { TaskId, TaskSnapshot } from "../task-model";
import type { UpdateTaskOptions } from "./options";

/**
 * A typed facade over a single task created through the callback form of `task(...)`.
 *
 * Use this handle to update counts, metadata, description, or to explicitly finalize the task
 * before the callback exits. If the callback returns or fails while the task is still `running`,
 * the library auto-finalizes it from the callback exit status instead.
 */
export interface TaskHandle<M> {
  readonly id: TaskId;
  /** Reads the current metadata value for the task using the metadata type inferred at creation. */
  readonly getMetadata: Effect.Effect<M>;
  /** Replaces the task metadata. */
  readonly setMetadata: (metadata: M) => Effect.Effect<void>;
  /** Updates the current metadata value atomically. */
  readonly updateMetadata: (f: (m: M) => M) => Effect.Effect<void>;
  /** Increments the succeeded counter for the task. */
  readonly incrementSucceeded: (amount?: number) => Effect.Effect<void>;
  /** Increments the failed counter for the task. */
  readonly incrementFailed: (amount?: number) => Effect.Effect<void>;
  /** Updates mutable task fields such as description, totals, and count display. */
  readonly update: (options: UpdateTaskOptions) => Effect.Effect<void>;
  /** Marks the task as done immediately. Finalization is terminal once the task leaves `running`. */
  readonly complete: Effect.Effect<void>;
  /** Marks the task as failed immediately. Finalization is terminal once the task leaves `running`. */
  readonly fail: Effect.Effect<void>;
  /** Reads the latest task snapshot. */
  readonly getSnapshot: Effect.Effect<TaskSnapshot>;
}
