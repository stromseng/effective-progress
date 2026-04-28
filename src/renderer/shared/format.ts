import type { TaskSnapshot } from "../../types";

const isDeterminate = (
  task: TaskSnapshot,
): task is TaskSnapshot & { readonly units: TaskSnapshot["units"] & { readonly total: number } } =>
  task.units.total !== undefined;

const showsUnknownTotalCounts = (task: TaskSnapshot): boolean =>
  task.units.total === undefined && task.units.processed > 0;

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

export const formatElapsedClock = (task: TaskSnapshot, now: number): string => {
  const elapsedMillis = Math.max(0, (task.completedAt ?? now) - task.startedAt);
  return formatClockDurationSeconds(elapsedMillis / 1000);
};

export const formatEta = (task: TaskSnapshot, now: number): string => {
  if (task.status !== "running" || !isDeterminate(task)) {
    return "";
  }

  const { processed, total } = task.units;
  const remaining = total - processed;
  if (processed <= 0 || remaining <= 0) {
    return "";
  }

  const elapsedMillis = Math.max(1, now - task.startedAt);
  const etaMillis = Math.max(0, Math.floor((elapsedMillis / processed) * remaining));
  return formatDurationSeconds(etaMillis / 1000);
};

export const formatEtaClock = (task: TaskSnapshot, now: number): string | undefined => {
  if (task.status !== "running" || !isDeterminate(task)) {
    return undefined;
  }

  const { processed, total } = task.units;
  const remaining = total - processed;
  if (processed <= 0 || remaining <= 0) {
    return undefined;
  }

  const elapsedMillis = Math.max(1, now - task.startedAt);
  const etaMillis = Math.max(0, Math.floor((elapsedMillis / processed) * remaining));
  return formatClockDurationSeconds(etaMillis / 1000);
};

export const formatElapsedEta = (task: TaskSnapshot, now: number): string =>
  `${formatElapsedClock(task, now)}<${formatEtaClock(task, now) ?? "00:00"}`;

interface DeterminateAmountParts {
  readonly succeeded: string;
  readonly failed: string;
  readonly processed: string;
  readonly total: string;
}

type DeterminateProcessedColor = "green" | "yellow" | "red" | "whiteBright";

const formatDeterminateAmountParts = (task: TaskSnapshot): DeterminateAmountParts | undefined => {
  if (!isDeterminate(task)) {
    return undefined;
  }

  const totalText = `${task.units.total}`;
  const width = totalText.length;
  const processedText = `${task.units.processed}`;

  return {
    succeeded:
      task.countDisplay === "detailed" ? `${task.units.succeeded}`.padStart(width, " ") : "",
    failed: task.countDisplay === "detailed" ? `${task.units.failed}`.padStart(width, " ") : "",
    processed: processedText,
    total: totalText,
  };
};

export const getDeterminateProcessedColor = (task: TaskSnapshot): DeterminateProcessedColor => {
  if (!isDeterminate(task)) {
    return "whiteBright";
  }

  const { succeeded, failed, processed, total } = task.units;
  if (task.status === "failed" && processed < total) {
    return "red";
  }
  if (processed >= total && failed === 0) {
    return "green";
  }
  if (processed >= total && failed > 0 && succeeded === 0) {
    return "red";
  }
  if (succeeded > 0 && failed > 0) {
    return "yellow";
  }
  if (failed > 0 && succeeded === 0) {
    return "red";
  }
  return "whiteBright";
};

export const formatAmount = (task: TaskSnapshot, _tick: number): string => {
  if (isDeterminate(task)) {
    const parts = formatDeterminateAmountParts(task);
    if (parts === undefined) {
      return "";
    }
    if (task.countDisplay === "detailed") {
      return `${parts.succeeded} ${parts.failed} ${parts.processed}/${parts.total}`;
    }
    return `${parts.processed}/${parts.total}`;
  }

  if (showsUnknownTotalCounts(task)) {
    if (task.countDisplay === "detailed") {
      return `${task.units.succeeded} ${task.units.failed} ${task.units.processed}/?`;
    }
    return `${task.units.processed}/?`;
  }

  if (task.status === "running") {
    return "";
  }

  return task.status === "failed" ? "✗" : "";
};
