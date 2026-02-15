import { Clock, Duration, Effect, Ref, Schema } from "effect";
import {
  type CompiledProgressBarColors,
  compileProgressBarColors,
  ProgressBarColorsSchema,
} from "./colors";
import type { ProgressTerminalService } from "./terminal";
import type { ProgressBarConfigShape, RendererConfigShape, TaskStore } from "./types";
import { DeterminateTaskUnits, TaskSnapshot } from "./types";

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

const formatElapsed = (snapshot: TaskSnapshot, now: number): string => {
  const elapsedMillis = (snapshot.completedAt ?? now) - snapshot.startedAt;
  const duration =
    snapshot.status === "running"
      ? Duration.seconds(Math.floor(elapsedMillis / 1000))
      : Duration.millis(elapsedMillis);
  return ` (${Duration.format(duration)})`;
};

const buildTaskLine = (
  snapshot: TaskSnapshot,
  depth: number,
  tick: number,
  colors: CompiledProgressBarColors,
  now: number,
): string => {
  const progressbar = snapshot.config;
  const prefix = `${"  ".repeat(depth)}- ${snapshot.description}: `;
  const elapsed = formatElapsed(snapshot, now);

  if (snapshot.status === "failed") {
    return `${prefix}${colors.failed("[failed]")}${elapsed}`;
  }

  if (snapshot.status === "done") {
    if (snapshot.units._tag === "DeterminateTaskUnits") {
      return `${prefix}${colors.done("[done]")} ${snapshot.units.completed}/${snapshot.units.total}${elapsed}`;
    }
    return `${prefix}${colors.done("[done]")}${elapsed}`;
  }

  if (snapshot.units._tag === "DeterminateTaskUnits") {
    return prefix + renderDeterminate(snapshot.units, progressbar, colors) + elapsed;
  }

  const frames = progressbar.spinnerFrames;
  const frameIndex = (snapshot.units.spinnerFrame + tick) % frames.length;
  const frame = frames[frameIndex] ?? frames[0]!;
  return `${prefix}${colors.spinner(frame)}${elapsed}`;
};

export const runProgressServiceRenderer = (
  storeRef: Ref.Ref<TaskStore>,
  logsRef: Ref.Ref<ReadonlyArray<string>>,
  pendingLogsRef: Ref.Ref<ReadonlyArray<string>>,
  dirtyRef: Ref.Ref<boolean>,
  terminal: ProgressTerminalService,
  isTTY: boolean,
  rendererConfig: RendererConfigShape,
  maxRetainedLogLines: number,
) => {
  const retainLogHistory = maxRetainedLogLines > 0;
  const colorCache = new Map<string, CompiledProgressBarColors>();
  let previousLineCount = 0;
  let nonTTYTaskSignatureById = new Map<number, string>();
  let tick = 0;
  let rendererActive = false;
  let sessionActive = false;

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

  const clipTTYFrameLines = (lines: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const terminalRows = yield* terminal.stderrRows;
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
    });

  const startTTYSession = Effect.gen(function* () {
    if (!isTTY || sessionActive) {
      return;
    }

    yield* terminal.writeStderr(HIDE_CURSOR);
    sessionActive = true;
  });

  const stopTTYSession = Effect.gen(function* () {
    if (!isTTY || !sessionActive) {
      return;
    }

    yield* terminal.writeStderr("\n" + SHOW_CURSOR);
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

    return Effect.gen(function* () {
      if (changedTaskLines.length > 0) {
        yield* terminal.writeStderr(changedTaskLines.join("\n") + "\n");
      }

      nonTTYTaskSignatureById = nextTaskSignatureById;
    });
  };

  const renderFrame = (mode: "tick" | "final") =>
    Effect.gen(function* () {
      const drainedLogs = yield* Ref.getAndSet(pendingLogsRef, []);
      const store = yield* Ref.get(storeRef);
      const ordered = store.renderOrder.flatMap((row) => {
        const snapshot = store.tasks.get(row.id);
        if (!snapshot || (snapshot.transient && snapshot.status !== "running")) return [];
        return [{ snapshot, depth: row.depth }];
      });
      const now = yield* Clock.currentTimeMillis;
      const frameTick = mode === "final" ? tick + 1 : tick;
      const taskLines = ordered.map(({ snapshot, depth }) => {
        const lineTick = isTTY ? frameTick : 0;
        return buildTaskLine(snapshot, depth, lineTick, getCompiledColors(snapshot.config), now);
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
          const lines = yield* clipTTYFrameLines([...historyLogs, ...taskLines]);
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
          yield* terminal.writeStderr(frame);
        }
        return;
      }

      if (drainedLogs.length > 0) {
        yield* terminal.writeStderr(drainedLogs.join("\n") + "\n");
      }
      yield* renderNonTTYTaskUpdates(ordered, taskLines);
    });

  const renderLoop = Effect.gen(function* () {
    rendererActive = true;
    if (isTTY) {
      yield* startTTYSession;
    }

    while (true) {
      const dirty = yield* Ref.getAndSet(dirtyRef, false);
      const tasks = Array.from((yield* Ref.get(storeRef)).tasks.values()).filter(
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

  if (isTTY && rendererConfig.disableUserInput) {
    return terminal.withRawInputCapture(renderLoop);
  }

  return renderLoop;
};
