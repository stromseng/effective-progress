import type { TaskSnapshot } from "../task-model";
import { estimateRemainingMillis } from "../progress-estimation";
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
  const etaMillis = estimateRemainingMillis(task);
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
