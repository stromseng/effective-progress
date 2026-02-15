import { Effect, Ref, Schema } from "effect";
import {
  type CompiledProgressBarColors,
  compileProgressBarColors,
  ProgressBarColorsSchema,
} from "./colors";
import type { ProgressBarConfigShape, RendererConfigShape } from "./types";
import { DeterminateTaskUnits, TaskId, TaskSnapshot } from "./types";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";
const MOVE_UP_ONE = "\x1b[1A";
const encodeProgressBarColorsKey = Schema.encodeSync(Schema.parseJson(ProgressBarColorsSchema));

const renderDeterminate = (
  units: DeterminateTaskUnits,
  progressbar: ProgressBarConfigShape,
  colors: CompiledProgressBarColors,
): string => {
  const safeTotal = units.total <= 0 ? 1 : units.total;
  const ratio = Math.min(1, Math.max(0, units.completed / safeTotal));
  const filled = Math.round(ratio * progressbar.barWidth);
  const bar = `${colors.fill(progressbar.fillChar.repeat(filled))}${colors.empty(progressbar.emptyChar.repeat(progressbar.barWidth - filled))}`;
  const percent = String(Math.round(ratio * 100)).padStart(3, " ");
  return `${colors.brackets(progressbar.leftBracket)}${bar}${colors.brackets(progressbar.rightBracket)} ${units.completed}/${units.total} ${colors.percent(percent + "%")}`;
};

const buildTaskLine = (
  snapshot: TaskSnapshot,
  depth: number,
  tick: number,
  colors: CompiledProgressBarColors,
): string => {
  const progressbar = snapshot.progressbar;
  const prefix = `${"  ".repeat(depth)}- ${snapshot.description}: `;

  if (snapshot.status === "failed") {
    return `${prefix}${colors.failed("[failed]")}`;
  }

  if (snapshot.status === "done") {
    if (snapshot.units._tag === "DeterminateTaskUnits") {
      return `${prefix}${colors.done("[done]")} ${snapshot.units.completed}/${snapshot.units.total}`;
    }
    return `${prefix}${colors.done("[done]")}`;
  }

  if (snapshot.units._tag === "DeterminateTaskUnits") {
    return prefix + renderDeterminate(snapshot.units, progressbar, colors);
  }

  const frames = progressbar.spinnerFrames;
  const frameIndex = (snapshot.units.spinnerFrame + tick) % frames.length;
  const frame = frames[frameIndex] ?? frames[0]!;
  return `${prefix}${colors.spinner(frame)}`;
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
  rendererConfig: RendererConfigShape,
  maxRetainedLogLines: number,
) => {
  const isTTY = rendererConfig.isTTY;
  const retainLogHistory = maxRetainedLogLines > 0;
  const colorCache = new Map<string, CompiledProgressBarColors>();
  let previousLineCount = 0;
  let nonTTYTaskSignatureById = new Map<number, string>();
  let tick = 0;
  let rendererActive = false;
  let sessionActive = false;
  let teardownInput: (() => void) | undefined;

  const getCompiledColors = (progressbar: ProgressBarConfigShape): CompiledProgressBarColors => {
    const key = encodeProgressBarColorsKey(progressbar.colors);
    const cached = colorCache.get(key);
    if (cached) {
      return cached;
    }

    const compiled = compileProgressBarColors(progressbar.colors);
    colorCache.set(key, compiled);
    return compiled;
  };

  const clipTTYFrameLines = (lines: ReadonlyArray<string>): ReadonlyArray<string> => {
    const terminalRows = process.stderr.rows;
    if (terminalRows === undefined) {
      return lines;
    }

    const visibleLineLimit = Math.max(1, terminalRows - 1);
    if (lines.length <= visibleLineLimit) {
      return lines;
    }

    if (visibleLineLimit === 1) {
      return [`... ${lines.length} lines hidden`];
    }

    const hiddenLineCount = lines.length - visibleLineLimit + 1;
    return [
      `... ${hiddenLineCount} lines hidden (showing latest lines)`,
      ...lines.slice(lines.length - (visibleLineLimit - 1)),
    ];
  };

  const startTTYSession = Effect.gen(function* () {
    if (!isTTY || sessionActive) {
      return;
    }

    process.stderr.write(HIDE_CURSOR);

    if (rendererConfig.disableUserInput && process.stdin.isTTY) {
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

    sessionActive = true;
  });

  const stopTTYSession = Effect.gen(function* () {
    if (!isTTY || !sessionActive) {
      return;
    }

    teardownInput?.();
    teardownInput = undefined;
    process.stderr.write("\n" + SHOW_CURSOR);
    previousLineCount = 0;
    sessionActive = false;
  });

  const renderNonTTYTaskUpdates = (
    ordered: ReadonlyArray<{ snapshot: TaskSnapshot; depth: number }>,
    taskLines: ReadonlyArray<string>,
  ) => {
    const nextTaskSignatureById = new Map<number, string>();
    const changedTaskLines: Array<string> = [];
    const nonTtyUpdateStep = Math.max(1, Math.floor(rendererConfig.nonTtyUpdateStep));

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
        return buildTaskLine(snapshot, depth, lineTick, getCompiledColors(snapshot.progressbar));
      });

      if (isTTY) {
        let frame = "";

        // 1. Cursor reset — move up and clear previous frame lines
        if (previousLineCount > 0) {
          frame += "\r" + CLEAR_LINE;
          for (let i = 1; i < previousLineCount; i++) {
            frame += MOVE_UP_ONE + CLEAR_LINE;
          }
        }

        if (retainLogHistory) {
          const historyLogs = yield* Ref.get(logsRef);
          const lines = clipTTYFrameLines([...historyLogs, ...taskLines]);
          if (lines.length > 0) {
            frame += lines.join("\n");
          }
          previousLineCount = lines.length;
        } else {
          // 2. Logs (scroll above the task block)
          if (drainedLogs.length > 0) {
            frame += drainedLogs.join("\n") + "\n";
          }
          // 3. Task lines
          if (taskLines.length > 0) {
            frame += taskLines.join("\n");
          }
          previousLineCount = taskLines.length;
        }

        // 4. Single atomic write
        if (frame) {
          process.stderr.write(frame);
        }
        return;
      }

      if (drainedLogs.length > 0) {
        process.stderr.write(drainedLogs.join("\n") + "\n");
      }
      renderNonTTYTaskUpdates(ordered, taskLines);
    });

  return Effect.gen(function* () {
    rendererActive = true;
    if (isTTY) {
      yield* startTTYSession;
    }

    while (true) {
      const dirty = yield* Ref.getAndSet(dirtyRef, false);
      const tasks = Array.from((yield* Ref.get(tasksRef)).values()).filter(
        (task) => !(task.transient && task.status !== "running"),
      );
      const hasActiveSpinners = tasks.some(
        (task) => task.status === "running" && task.units._tag === "IndeterminateTaskUnits",
      );
      const hasPendingLogs = (yield* Ref.get(pendingLogsRef)).length > 0;

      if (isTTY) {
        if (dirty || hasActiveSpinners || hasPendingLogs) {
          yield* renderFrame("tick");
        }
      } else if (dirty || hasActiveSpinners) {
        yield* renderFrame("tick");
      }

      tick += 1;
      yield* Effect.sleep(Math.max(1, Math.floor(rendererConfig.renderIntervalMillis)));
    }
  }).pipe(
    Effect.ensuring(
      Effect.gen(function* () {
        if (!rendererActive) {
          return;
        }

        if (isTTY) {
          if (sessionActive) {
            yield* renderFrame("final");
            yield* stopTTYSession;
          }
          return;
        }

        yield* renderFrame("final");
      }),
    ),
  );
};
