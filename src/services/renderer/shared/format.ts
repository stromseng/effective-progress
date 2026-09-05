import type { TaskSnapshot } from "../../../types";
import { isDeterminate } from "./determinate";
import { getAmountParts } from "./amount-parts";

const formatDurationSeconds = (seconds: number): string => {
  const value = Math.max(0, Math.floor(seconds));
  if (value < 60) {
    return `${value}s`;
  }
  if (value < 3600) {
    const mins = Math.floor(value / 60);
    const secs = value % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  const hours = Math.floor(value / 3600);
  const mins = Math.floor((value % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const formatClockDurationSeconds = (seconds: number): string => {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const mins = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  const clock = `${`${mins}`.padStart(2, "0")}:${`${secs}`.padStart(2, "0")}`;
  return hours > 0 ? `${`${hours}`.padStart(2, "0")}:${clock}` : clock;
};

/**
 * Estimates remaining time from the task's retained progress sample deque.
 *
 * Returns undefined until there are at least two samples with positive processed and time deltas.
 */
const getSmoothedEtaMillis = (
  task: TaskSnapshot & { readonly units: TaskSnapshot["units"] & { readonly total: number } },
): number | undefined => {
  const { processed, total } = task.units;
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

  // The store maintains this as a retained rolling deque, so the first and last samples represent
  // recent throughput rather than lifetime average throughput.
  const deltaProcessed = lastSample.processed - firstSample.processed;
  const deltaMillis = lastSample.timestamp - firstSample.timestamp;
  if (deltaProcessed <= 0 || deltaMillis <= 0) {
    return undefined;
  }

  return Math.max(0, Math.floor((remaining * deltaMillis) / deltaProcessed));
};

export const formatElapsed = (task: TaskSnapshot, now: number): string => {
  const elapsedMillis = Math.max(0, (task.completedAt ?? now) - task.startedAt);
  return formatDurationSeconds(elapsedMillis / 1000);
};

const formatElapsedClock = (task: TaskSnapshot, now: number): string => {
  const elapsedMillis = Math.max(0, (task.completedAt ?? now) - task.startedAt);
  return formatClockDurationSeconds(elapsedMillis / 1000);
};

export const formatEta = (task: TaskSnapshot): string => formatEtaClock(task) ?? "";

const formatEtaClock = (task: TaskSnapshot): string | undefined => {
  if (task.status !== "running" || !isDeterminate(task)) {
    return undefined;
  }

  const { processed, total } = task.units;
  const remaining = total - processed;
  if (processed <= 0 || remaining <= 0) {
    return undefined;
  }

  const etaMillis = getSmoothedEtaMillis(task);
  if (etaMillis === undefined) {
    return undefined;
  }

  return formatClockDurationSeconds(etaMillis / 1000);
};

export const formatElapsedEta = (task: TaskSnapshot, now: number): string =>
  `${formatElapsedClock(task, now)}<${formatEtaClock(task) ?? "00:00"}`;

export const formatAmount = (task: TaskSnapshot): string => {
  const parts = getAmountParts(task);
  if (parts.kind === "indicator") {
    return parts.text;
  }
  const processed = `${parts.processed}/${parts.total}`;
  return parts.detailed ? `${parts.succeeded} ${parts.failed} ${processed}` : processed;
};
