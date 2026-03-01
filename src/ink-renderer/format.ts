import type { TaskSnapshot } from "../types";

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export const formatDurationSeconds = (seconds: number): string => {
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

export const formatElapsed = (task: TaskSnapshot, now: number): string => {
  const elapsedMillis = Math.max(0, (task.completedAt ?? now) - task.startedAt);
  return formatDurationSeconds(elapsedMillis / 1000);
};

export const formatEta = (task: TaskSnapshot, now: number): string => {
  if (task.status !== "running" || task.units._tag !== "DeterminateTaskUnits") {
    return "";
  }

  const { completed, total } = task.units;
  const remaining = total - completed;
  if (completed <= 0 || remaining <= 0) {
    return "";
  }

  const elapsedMillis = Math.max(1, now - task.startedAt);
  const etaMillis = Math.max(0, Math.floor((elapsedMillis / completed) * remaining));
  return formatDurationSeconds(etaMillis / 1000);
};

export const formatAmount = (task: TaskSnapshot, tick: number): string => {
  if (task.units._tag === "DeterminateTaskUnits") {
    const totalText = `${task.units.total}`;
    const completedText = `${task.units.completed}`.padStart(totalText.length, " ");
    return `${completedText}/${totalText}`;
  }

  if (task.status === "running") {
    const frameIndex = (task.units.spinnerFrame + tick) % SPINNER_FRAMES.length;
    return SPINNER_FRAMES[frameIndex] ?? SPINNER_FRAMES[0]!;
  }

  return task.status === "done" ? "✓" : "✗";
};
