import type { AddTaskOptions, UpdateTaskOptions } from "../../tasks/options";
import type { TaskId, TaskSnapshot } from "../../task-model";

interface TaskCounts {
  readonly succeeded: number;
  readonly failed: number;
  readonly total?: number;
}

const hasExplicitTotal = (options: Pick<AddTaskOptions | UpdateTaskOptions, "total">) =>
  Object.prototype.hasOwnProperty.call(options, "total");

const sanitizeTotal = (total: number | undefined) => {
  if (total === undefined) {
    return undefined;
  }

  return !Number.isFinite(total) || total < 0 ? undefined : total;
};

export const normalizeUnits = (counts: TaskCounts) => {
  const succeeded = Math.max(0, counts.succeeded);
  const failed = Math.max(0, counts.failed);

  return counts.total === undefined
    ? {
        succeeded,
        failed,
        processed: succeeded + failed,
      }
    : {
        succeeded,
        failed,
        processed: succeeded + failed,
        total: counts.total,
      };
};

/** Completes remaining known work, or records the observed total for an unknown-total task. */
const completedUnits = (units: TaskSnapshot["units"]): TaskSnapshot["units"] => {
  if (units.total === undefined) {
    return units.processed > 0 ? normalizeUnits({ ...units, total: units.processed }) : units;
  }

  return units.processed < units.total
    ? normalizeUnits({
        ...units,
        succeeded: units.succeeded + (units.total - units.processed),
      })
    : units;
};

/** Applies mutable task fields; the mutation boundary records progress samples. */
export const updatedSnapshot = (snapshot: TaskSnapshot, options: UpdateTaskOptions) => {
  const currentUnits = snapshot.units;
  const units =
    options.succeeded === undefined &&
    options.failed === undefined &&
    options.total === undefined &&
    !hasExplicitTotal(options)
      ? currentUnits
      : normalizeUnits({
          succeeded: options.succeeded ?? currentUnits.succeeded,
          failed: options.failed ?? currentUnits.failed,
          total: hasExplicitTotal(options) ? sanitizeTotal(options.total) : currentUnits.total,
        });

  return {
    ...snapshot,
    description: options.description ?? snapshot.description,
    countDisplay: options.countDisplay ?? snapshot.countDisplay,
    units,
  } satisfies TaskSnapshot;
};

/** Creates task data with inherited display and cleanup policies. */
export const createTaskSnapshot = <M>(
  taskId: TaskId,
  options: AddTaskOptions<M>,
  parent: TaskSnapshot | undefined,
  now: number,
): TaskSnapshot => {
  const units = normalizeUnits({
    succeeded: 0,
    failed: 0,
    total: sanitizeTotal(options.total),
  });
  const parentId = options.parentId ?? null;
  const countDisplay = options.countDisplay ?? parent?.countDisplay ?? "detailed";
  const task = {
    id: taskId,
    parentId,
    description: options.description,
    status: "running",
    countDisplay,
    transient: (parent?.transient ?? false) || (options.transient ?? false),
    units,
    startedAt: now,
    completedAt: null,
    progressSamples: [{ timestamp: now, processed: units.processed }],
    metadata: options.metadata,
  } satisfies TaskSnapshot;

  return task;
};

/** Finalization is terminal; undefined requests removal of a transient subtree. */
export const finalizeTaskSnapshot = (
  task: TaskSnapshot,
  status: "done" | "failed",
  now: number,
): TaskSnapshot | undefined => {
  if (task.status !== "running") {
    return task;
  }
  if (task.transient) {
    return undefined;
  }
  return {
    ...task,
    status,
    units: status === "done" ? completedUnits(task.units) : task.units,
    completedAt: now,
  };
};
