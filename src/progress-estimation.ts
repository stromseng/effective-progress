import type { TaskProgressSample, TaskSnapshot } from "./task-model";

const ETA_SAMPLE_WINDOW_MILLIS = 30_000;
const ETA_SAMPLE_MAX_LENGTH = 1_000;

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

/**
 * Estimates remaining time from the task's retained progress sample deque.
 *
 * Returns undefined for inactive or unknown-total tasks, no remaining work, or insufficient
 * observations with positive processed and time deltas.
 */
export const estimateRemainingMillis = (task: TaskSnapshot): number | undefined => {
  const { processed, total } = task.units;
  if (task.status !== "running" || total === undefined) {
    return undefined;
  }

  const remaining = total - processed;
  if (processed <= 0 || remaining <= 0) {
    return undefined;
  }

  const samples = task.progressSamples;
  const lastSample = samples.at(-1);
  if (lastSample === undefined) {
    return undefined;
  }

  const firstSample = samples[0];
  if (firstSample === undefined || firstSample === lastSample) {
    return undefined;
  }

  // appendProgressSample retains the rolling window, so these endpoints measure recent throughput.
  const deltaProcessed = lastSample.processed - firstSample.processed;
  const deltaMillis = lastSample.timestamp - firstSample.timestamp;
  if (deltaProcessed <= 0 || deltaMillis <= 0) {
    return undefined;
  }

  return Math.max(0, Math.floor((remaining * deltaMillis) / deltaProcessed));
};
