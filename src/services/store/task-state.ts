import type {
  AddTaskOptions,
  TaskId,
  TaskProgressSample,
  TaskSnapshot,
  UpdateTaskOptions,
} from "../../types";

interface TaskCounts {
  readonly succeeded: number;
  readonly failed: number;
  readonly total?: number;
}

const ETA_SAMPLE_WINDOW_MILLIS = 30_000;
const ETA_SAMPLE_MAX_LENGTH = 1_000;

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

/**
 * Returns a new progress sample deque with the latest processed count appended.
 *
 * Samples are retained for the ETA rolling window and capped by count so very chatty tasks do not
 * grow memory without bound.
 */
export const appendProgressSample = (
  samples: ReadonlyArray<TaskProgressSample> | undefined,
  now: number,
  processed: number,
): ReadonlyArray<TaskProgressSample> => {
  const previousSamples = samples ?? [];
  const lastSample = previousSamples.at(-1);
  if (lastSample?.processed === processed) {
    return previousSamples;
  }

  // Keep one sample immediately before the rolling window when possible. That gives the ETA
  // calculation a usable delta even just after old samples age out of the 30s window.
  const windowStart = now - ETA_SAMPLE_WINDOW_MILLIS;
  const appendedLength = previousSamples.length + 1;
  let firstRetainedIndex = Math.max(0, appendedLength - ETA_SAMPLE_MAX_LENGTH);
  while (
    firstRetainedIndex + 1 < previousSamples.length &&
    previousSamples[firstRetainedIndex + 1]!.timestamp < windowStart
  ) {
    firstRetainedIndex++;
  }

  return [...previousSamples.slice(firstRetainedIndex), { timestamp: now, processed }];
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
