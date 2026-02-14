import { Effect, Ref } from "effect";
import chalk from "chalk";
import type { ProgressBarConfigShape } from "./types";
import { DeterminateTaskUnits, TaskId, TaskSnapshot } from "./types";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";
const MOVE_UP_ONE = "\x1b[1A";
const RENDER_INTERVAL = "80 millis";

const renderDeterminate = (units: DeterminateTaskUnits, config: ProgressBarConfigShape): string => {
  const safeTotal = units.total <= 0 ? 1 : units.total;
  const ratio = Math.min(1, Math.max(0, units.completed / safeTotal));
  const filled = Math.round(ratio * config.barWidth);
  const bar = `${chalk.cyan(config.fillChar.repeat(filled))}${chalk.dim(config.emptyChar.repeat(config.barWidth - filled))}`;
  const percent = String(Math.round(ratio * 100)).padStart(3, " ");
  return `${chalk.dim(config.leftBracket)}${bar}${chalk.dim(config.rightBracket)} ${units.completed}/${units.total} ${chalk.bold(percent + "%")}`;
};

const buildTaskLine = (
  snapshot: TaskSnapshot,
  depth: number,
  tick: number,
  config: ProgressBarConfigShape,
): string => {
  const prefix = `${"  ".repeat(depth)}- ${snapshot.description}: `;

  if (snapshot.status === "failed") {
    return `${prefix}${chalk.red("[failed]")}`;
  }

  if (snapshot.status === "done") {
    if (snapshot.units._tag === "DeterminateTaskUnits") {
      return `${prefix}${chalk.green("[done]")} ${snapshot.units.completed}/${snapshot.units.total}`;
    }
    return `${prefix}${chalk.green("[done]")}`;
  }

  if (snapshot.units._tag === "DeterminateTaskUnits") {
    return prefix + renderDeterminate(snapshot.units, config);
  }

  const frames = config.spinnerFrames;
  const frameIndex = (snapshot.units.spinnerFrame + tick) % frames.length;
  return `${prefix}${chalk.yellow(frames[frameIndex])}`;
};

const orderTasksForRender = (
  tasks: ReadonlyArray<TaskSnapshot>,
): ReadonlyArray<{ snapshot: TaskSnapshot; depth: number }> => {
  const byParent = new Map<number | null, Array<TaskSnapshot>>();
  for (const task of tasks) {
    const bucket = byParent.get(task.parentId) ?? [];
    bucket.push(task);
    byParent.set(task.parentId, bucket);
  }

  const ordered: Array<{ snapshot: TaskSnapshot; depth: number }> = [];
  const visit = (parentId: number | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      ordered.push({ snapshot: child, depth });
      visit(child.id, depth + 1);
    }
  };

  visit(null, 0);
  return ordered;
};

export const runProgressServiceRenderer = (
  tasksRef: Ref.Ref<Map<TaskId, TaskSnapshot>>,
  logsRef: Ref.Ref<ReadonlyArray<string>>,
  pendingLogsRef: Ref.Ref<ReadonlyArray<string>>,
  dirtyRef: Ref.Ref<boolean>,
  config: ProgressBarConfigShape,
  maxRetainedLogLines: number,
) => {
  const isTTY = config.isTTY;
  const retainLogHistory = maxRetainedLogLines > 0;
  let previousLineCount = 0;
  let previousTaskLineCount = 0;
  let nonTTYTaskSignatureById = new Map<number, string>();
  let tick = 0;
  let teardownInput: (() => void) | undefined;

  const clearTTYLines = (lineCount: number) => {
    if (lineCount <= 0) {
      return;
    }

    let output = "\r" + CLEAR_LINE;
    for (let i = 1; i < lineCount; i++) {
      output += MOVE_UP_ONE + CLEAR_LINE;
    }
    process.stderr.write(output + "\r");
  };

  const renderNonTTYTaskUpdates = (
    ordered: ReadonlyArray<{ snapshot: TaskSnapshot; depth: number }>,
    taskLines: ReadonlyArray<string>,
  ) => {
    const nextTaskSignatureById = new Map<number, string>();
    const changedTaskLines: Array<string> = [];
    const nonTtyUpdateStep = Math.max(1, Math.floor(config.nonTtyUpdateStep));

    for (let i = 0; i < ordered.length; i++) {
      const taskId = ordered[i]!.snapshot.id as number;
      const snapshot = ordered[i]!.snapshot;
      const line = taskLines[i]!;
      const signature =
        snapshot.units._tag === "DeterminateTaskUnits"
          ? `${snapshot.status}:${snapshot.description}:${Math.floor(snapshot.units.completed / nonTtyUpdateStep)}:${snapshot.units.total}`
          : `${snapshot.status}:${snapshot.description}`;

      nextTaskSignatureById.set(taskId, signature);
      if (nonTTYTaskSignatureById.get(taskId) !== signature) {
        changedTaskLines.push(line);
      }
    }

    if (changedTaskLines.length > 0) {
      process.stderr.write(changedTaskLines.join("\n") + "\n");
    }

    nonTTYTaskSignatureById = nextTaskSignatureById;
  };

  const renderFrame = (mode: "tick" | "final") =>
    Effect.gen(function* () {
      const drainedLogs = yield* Ref.getAndSet(pendingLogsRef, []);
      const snapshots = Array.from((yield* Ref.get(tasksRef)).values()).filter(
        (task) => !(task.transient && task.status !== "running"),
      );
      const ordered = orderTasksForRender(snapshots);
      const frameTick = mode === "final" ? tick + 1 : tick;
      const taskLines = ordered.map(({ snapshot, depth }) => {
        const lineTick = isTTY ? frameTick : 0;
        return buildTaskLine(snapshot, depth, lineTick, config);
      });

      if (isTTY) {
        if (retainLogHistory) {
          const historyLogs = yield* Ref.get(logsRef);
          const lines = [...historyLogs, ...taskLines];
          clearTTYLines(previousLineCount);
          if (lines.length > 0) {
            process.stderr.write(lines.join("\n"));
          }
          previousLineCount = lines.length;
          return;
        }

        clearTTYLines(previousTaskLineCount);
        if (drainedLogs.length > 0) {
          process.stderr.write(drainedLogs.join("\n") + "\n");
        }
        if (taskLines.length > 0) {
          process.stderr.write(taskLines.join("\n"));
        }
        previousTaskLineCount = taskLines.length;
        return;
      }

      if (drainedLogs.length > 0) {
        process.stderr.write(drainedLogs.join("\n") + "\n");
      }
      renderNonTTYTaskUpdates(ordered, taskLines);
    });

  return Effect.gen(function* () {
    if (isTTY) {
      process.stderr.write(HIDE_CURSOR);

      if (config.disableUserInput && process.stdin.isTTY) {
        const stdin = process.stdin;
        const wasRaw = Boolean(stdin.isRaw);
        stdin.resume();
        stdin.setRawMode?.(true);

        const onData = (chunk: Buffer) => {
          if (chunk.length === 1 && chunk[0] === 3) {
            process.kill(process.pid, "SIGINT");
          }
        };

        stdin.on("data", onData);

        teardownInput = () => {
          try {
            stdin.off("data", onData);
            stdin.setRawMode?.(wasRaw);
            stdin.pause();
          } catch {
            // Best effort terminal restoration.
          }
        };
      }
    }

    while (true) {
      const dirty = yield* Ref.getAndSet(dirtyRef, false);
      const hasActiveSpinners = yield* Ref.get(tasksRef).pipe(
        Effect.map((tasks) =>
          Array.from(tasks.values()).some(
            (task) => task.status === "running" && task.units._tag === "IndeterminateTaskUnits",
          ),
        ),
      );

      if (dirty || hasActiveSpinners) {
        yield* renderFrame("tick");
      }

      tick += 1;
      yield* Effect.sleep(RENDER_INTERVAL);
    }
  }).pipe(
    Effect.ensuring(
      Effect.gen(function* () {
        yield* renderFrame("final");

        if (isTTY) {
          teardownInput?.();
          process.stderr.write("\n" + SHOW_CURSOR);
        }
      }),
    ),
  );
};
