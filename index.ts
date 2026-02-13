import { Console, Deferred, Effect, Exit, Fiber, Queue, Schema } from "effect";
import { formatWithOptions } from "node:util";

type AllOptions = Parameters<typeof Effect.all>[1];

class LogEvent extends Schema.TaggedClass<LogEvent>()("Log", {
  message: Schema.String,
}) {}

class IncrementEvent extends Schema.TaggedClass<IncrementEvent>()("Increment", {
  amount: Schema.Number,
}) {}

class SetTotalEvent extends Schema.TaggedClass<SetTotalEvent>()("SetTotal", {
  total: Schema.Number,
}) {}

class StopEvent extends Schema.TaggedClass<StopEvent>()("Stop", {}) {}

class DelegateEvent extends Schema.TaggedClass<DelegateEvent>()("Delegate", {
  effect: Schema.Any,
  ack: Schema.optional(Schema.Any),
}) {
  declare readonly effect: Effect.Effect<void, never, never>;
  declare readonly ack?: Deferred.Deferred<void>;
}

const ProgressEventSchema = Schema.Union(
  LogEvent,
  IncrementEvent,
  SetTotalEvent,
  StopEvent,
  DelegateEvent,
);

type ProgressEvent = typeof ProgressEventSchema.Type;
const decodeProgressEvent = Schema.decodeSync(ProgressEventSchema);

const MAX_LOG_LINES = 8;
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";
const MOVE_UP_ONE = "\x1b[1A";

const renderBar = (completed: number, total: number) => {
  const width = 30;
  const safeTotal = total <= 0 ? 1 : total;
  const ratio = Math.min(1, Math.max(0, completed / safeTotal));
  const filled = Math.round(ratio * width);
  const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
  const percent = String(Math.round(ratio * 100)).padStart(3, " ");
  return `[${bar}] ${completed}/${total} ${percent}%`;
};

const runProgressRenderer = (queue: Queue.Queue<ProgressEvent>, total: number) =>
  Effect.gen(function* () {
    const isTTY = Boolean(process.stderr.isTTY);
    const state = {
      total,
      completed: 0,
      logs: [] as Array<string>,
      dirty: true,
    };

    let previousLineCount = 0;
    const ttyProgressStep = Math.max(1, Math.floor(total / 20));

    const clearTTY = () => {
      let output = "\r" + CLEAR_LINE;
      for (let i = 1; i < previousLineCount; i++) {
        output += MOVE_UP_ONE + CLEAR_LINE;
      }
      process.stderr.write(output + "\r");
      previousLineCount = 0;
    };

    const renderTTY = () => {
      const lines = [...state.logs, renderBar(state.completed, state.total)];

      let output = "\r" + CLEAR_LINE;
      for (let i = 1; i < previousLineCount; i++) {
        output += MOVE_UP_ONE + CLEAR_LINE;
      }
      output += lines.join("\n");

      process.stderr.write(output);
      previousLineCount = lines.length;
      state.dirty = false;
    };

    if (isTTY) {
      process.stderr.write(HIDE_CURSOR);
      renderTTY();
    }

    let done = false;
    while (!done) {
      const event = decodeProgressEvent(yield* Queue.take(queue));
      const rest = yield* Queue.takeAll(queue);
      const batchedEvents = [event, ...Array.from(rest, (next) => decodeProgressEvent(next))];

      for (const current of batchedEvents) {
        switch (current._tag) {
          case "Log": {
            if (isTTY) {
              state.logs.push(current.message);
              if (state.logs.length > MAX_LOG_LINES) {
                state.logs.shift();
              }
              state.dirty = true;
            } else {
              process.stderr.write(current.message + "\n");
            }
            break;
          }
          case "Increment": {
            state.completed = Math.min(state.total, state.completed + current.amount);
            if (isTTY) {
              state.dirty = true;
            } else if (state.completed === state.total || state.completed % ttyProgressStep === 0) {
              process.stderr.write(`Progress: ${state.completed}/${state.total}\n`);
            }
            break;
          }
          case "SetTotal": {
            state.total = Math.max(0, current.total);
            state.completed = Math.min(state.completed, state.total);
            state.dirty = true;
            break;
          }
          case "Stop": {
            done = true;
            break;
          }
          case "Delegate": {
            if (isTTY) {
              clearTTY();
            }

            yield* current.effect;
            if (current.ack) {
              yield* Deferred.succeed(current.ack, undefined);
            }

            if (isTTY) {
              state.dirty = true;
            }
            break;
          }
        }
      }

      if (isTTY && state.dirty) {
        renderTTY();
      }
    }

    if (isTTY) {
      process.stderr.write("\n" + SHOW_CURSOR);
    }
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        if (process.stderr.isTTY) {
          process.stderr.write(SHOW_CURSOR);
        }
      }),
    ),
  );

const makeProgressConsole = (
  queue: Queue.Queue<ProgressEvent>,
  outerConsole: Console.Console,
): Console.Console => {
  const formatArgs = (args: ReadonlyArray<any>) =>
    formatWithOptions(
      {
        colors: Boolean(process.stderr.isTTY),
        depth: 6,
      },
      ...args,
    );

  const log = (...args: ReadonlyArray<any>) =>
    Queue.offer(
      queue,
      new LogEvent({ message: formatArgs(args) }),
    );

  const unsafeLog = (...args: ReadonlyArray<any>) => {
    Queue.unsafeOffer(
      queue,
      new LogEvent({ message: formatArgs(args) }),
    );
  };

  const delegate = (effect: Effect.Effect<void, never, never>) =>
    Effect.gen(function* () {
      const ack = yield* Deferred.make<void>();
      yield* Queue.offer(
        queue,
        new DelegateEvent({ effect, ack }),
      );
      yield* Deferred.await(ack);
    });

  const unsafeDelegate = (effect: Effect.Effect<void, never, never>) => {
    Queue.unsafeOffer(
      queue,
      new DelegateEvent({ effect }),
    );
  };

  return {
    [Console.TypeId]: Console.TypeId,
    // Log assertion failures when condition is false.
    assert(condition, ...args) {
      return condition ? Effect.void : log("Assertion failed:", ...args);
    },
    // Clear the terminal screen.
    clear: delegate(outerConsole.clear),
    // Increment a named counter.
    count: (label) => delegate(outerConsole.count(label)),
    // Reset a named counter.
    countReset: (label) => delegate(outerConsole.countReset(label)),
    // Write a debug log line.
    debug: (...args) => log(...args),
    // Print a structured object inspection.
    dir: (item, options) => delegate(outerConsole.dir(item, options)),
    // Print XML-style / alternate object representation.
    dirxml: (...args) => delegate(outerConsole.dirxml(...args)),
    // Write an error log line.
    error: (...args) => log(...args),
    // Start a console group section.
    group: (...args) => delegate(outerConsole.group(...args)),
    // End the current console group section.
    groupEnd: delegate(outerConsole.groupEnd),
    // Write an informational log line.
    info: (...args) => log(...args),
    // Write a standard log line.
    log: (...args) => log(...args),
    // Render tabular data.
    table: (tabularData, properties) => delegate(outerConsole.table(tabularData, properties)),
    // Start a named timer.
    time: (label) => delegate(outerConsole.time(label)),
    // End a named timer and print elapsed time.
    timeEnd: (label) => delegate(outerConsole.timeEnd(label)),
    // Print current elapsed time for a named timer.
    timeLog: (label, ...args) => delegate(outerConsole.timeLog(label, ...args)),
    // Write a stack trace line.
    trace: (...args) => delegate(outerConsole.trace(...args)),
    // Write a warning log line.
    warn: (...args) => log(...args),
    unsafe: {
      // Unsafe assertion log: immediate/best-effort variant.
      assert(condition, ...args) {
        if (!condition) unsafeLog("Assertion failed:", ...args);
      },
      // Unsafe clear: immediate/best-effort variant.
      clear() {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.clear()));
      },
      // Unsafe count increment: immediate/best-effort variant.
      count(label) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.count(label)));
      },
      // Unsafe count reset: immediate/best-effort variant.
      countReset(label) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.countReset(label)));
      },
      // Unsafe debug log: immediate/best-effort variant.
      debug(...args) {
        unsafeLog(...args);
      },
      // Unsafe object inspection: immediate/best-effort variant.
      dir(item, options) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.dir(item, options)));
      },
      // Unsafe XML-style output: immediate/best-effort variant.
      dirxml(...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.dirxml(...args)));
      },
      // Unsafe error log: immediate/best-effort variant.
      error(...args) {
        unsafeLog(...args);
      },
      // Unsafe group start: immediate/best-effort variant.
      group(...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.group(...args)));
      },
      // Unsafe collapsed group start: immediate/best-effort variant.
      groupCollapsed(...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.groupCollapsed(...args)));
      },
      // Unsafe group end: immediate/best-effort variant.
      groupEnd() {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.groupEnd()));
      },
      // Unsafe info log: immediate/best-effort variant.
      info(...args) {
        unsafeLog(...args);
      },
      // Unsafe standard log: immediate/best-effort variant.
      log(...args) {
        unsafeLog(...args);
      },
      // Unsafe table output: immediate/best-effort variant.
      table(tabularData, properties) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.table(tabularData, properties)));
      },
      // Unsafe timer start: immediate/best-effort variant.
      time(label) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.time(label)));
      },
      // Unsafe timer end: immediate/best-effort variant.
      timeEnd(label) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.timeEnd(label)));
      },
      // Unsafe timer log: immediate/best-effort variant.
      timeLog(label, ...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.timeLog(label, ...args)));
      },
      // Unsafe trace log: immediate/best-effort variant.
      trace(...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.trace(...args)));
      },
      // Unsafe warning log: immediate/best-effort variant.
      warn(...args) {
        unsafeLog(...args);
      },
    },
  };
};

const trackProgress = <A, E, R, Options extends AllOptions>(
  effectsIterable: Array<Effect.Effect<A, E, R>>,
  options?: Options,
) => {
  return Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ProgressEvent>();
    const renderer = yield* Effect.fork(runProgressRenderer(queue, effectsIterable.length));
    const outerConsole = yield* Console.consoleWith((console) => Effect.succeed(console));
    const console = makeProgressConsole(queue, outerConsole);

    const tasks = effectsIterable.map((effect) =>
      Effect.gen(function* () {
        const result = yield* Effect.withConsole(effect, console);
        yield* Queue.offer(
          queue,
          new IncrementEvent({ amount: 1 }),
        );
        return result;
      }),
    );

    const exit = yield* Effect.exit(Effect.all(tasks, options));
    yield* Queue.offer(
      queue,
      new StopEvent({}),
    );
    yield* Fiber.join(renderer);
    return yield* Exit.match(exit, {
      onFailure: Effect.failCause,
      onSuccess: Effect.succeed,
    });
  });
};

const program = Effect.gen(function* () {
  const workItems = Array.from({ length: 100 }, (_, i) => i + 1);

  const results = yield* trackProgress(
    workItems.map((item) =>
      Effect.gen(function* () {
        yield* Effect.sleep("100  millis");
        yield* Console.log("test log from item", item);
        return yield* Effect.succeed(item);
      }),
    ),
  );
});

Effect.runPromise(program);
