import type { Effect, Option } from "effect";
import type { TaskId, TaskSnapshot } from "../task-model";
import type { UpdateTaskOptions } from "./options";

/**
 * A typed facade over a single task created through the callback form of `task(...)`.
 *
 * Use this handle to update counts, metadata, description, or to explicitly finalize the task
 * before the callback exits. If the callback returns or fails while the task is still `running`,
 * the library auto-finalizes it from the callback exit status instead.
 * Mutations after completion, failure, or removal are no-ops; metadata updaters are not invoked.
 */
export interface TaskHandle<M> {
  readonly id: TaskId;
  /** Reads typed metadata; None means the task was removed. Present undefined metadata is Some(undefined). */
  readonly getMetadata: Effect.Effect<Option.Option<M>>;
  /** Replaces the task metadata. */
  readonly setMetadata: (metadata: M) => Effect.Effect<void>;
  /** Updates the current metadata value atomically. */
  readonly updateMetadata: (f: (m: M) => M) => Effect.Effect<void>;
  /** Increments succeeded while running. Non-finite inputs or results are ignored. */
  readonly incrementSucceeded: (amount?: number) => Effect.Effect<void>;
  /** Increments failed while running. Non-finite inputs or results are ignored. */
  readonly incrementFailed: (amount?: number) => Effect.Effect<void>;
  /** Updates mutable task fields such as description, totals, and count display. */
  readonly update: (options: UpdateTaskOptions) => Effect.Effect<void>;
  /** Marks the task as done immediately. Finalization is terminal once the task leaves `running`. */
  readonly complete: Effect.Effect<void>;
  /** Marks the task as failed immediately. Finalization is terminal once the task leaves `running`. */
  readonly fail: Effect.Effect<void>;
  /** Reads the latest snapshot, or None if the task was removed. */
  readonly getSnapshot: Effect.Effect<Option.Option<TaskSnapshot>>;
}
