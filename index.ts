import { Effect, Console, Exit, Fiber, Queue } from "effect";

type AllOptions = Parameters<typeof Effect.all>[1];

type ProgressEvent =
  | { readonly _tag: "Log"; readonly message: string }
  | { readonly _tag: "Increment"; readonly amount: number }
  | { readonly _tag: "SetTotal"; readonly total: number }
  | { readonly _tag: "Stop" };

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
      const event = yield* Queue.take(queue);
      const batchedEvents = [event, ...(yield* Queue.takeAll(queue))];

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

const makeProgressConsole = (queue: Queue.Queue<ProgressEvent>): Console.Console => {
  const log = (...args: ReadonlyArray<any>) =>
    Queue.offer(queue, { _tag: "Log", message: args.map(String).join(" ") });
  const unsafeLog = (...args: ReadonlyArray<any>) => {
    Queue.unsafeOffer(queue, { _tag: "Log", message: args.map(String).join(" ") });
  };

  return {
    [Console.TypeId]: Console.TypeId,
    assert(condition, ...args) {
      return condition ? Effect.void : log("Assertion failed:", ...args);
    },
    clear: Effect.void,
    count: () => Effect.void,
    countReset: () => Effect.void,
    debug: (...args) => log(...args),
    dir: (item) => log(item),
    dirxml: (...args) => log(...args),
    error: (...args) => log(...args),
    group: () => Effect.void,
    groupEnd: Effect.void,
    info: (...args) => log(...args),
    log: (...args) => log(...args),
    table: (data) => log(data),
    time: () => Effect.void,
    timeEnd: () => Effect.void,
    timeLog: () => Effect.void,
    trace: (...args) => log(...args),
    warn: (...args) => log(...args),
    unsafe: {
      assert(condition, ...args) {
        if (!condition) unsafeLog("Assertion failed:", ...args);
      },
      clear() {},
      count() {},
      countReset() {},
      debug(...args) {
        unsafeLog(...args);
      },
      dir(item) {
        unsafeLog(item);
      },
      dirxml(...args) {
        unsafeLog(...args);
      },
      error(...args) {
        unsafeLog(...args);
      },
      group() {},
      groupCollapsed() {},
      groupEnd() {},
      info(...args) {
        unsafeLog(...args);
      },
      log(...args) {
        unsafeLog(...args);
      },
      table(data) {
        unsafeLog(data);
      },
      time() {},
      timeEnd() {},
      timeLog() {},
      trace(...args) {
        unsafeLog(...args);
      },
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
    const console = makeProgressConsole(queue);

    const tasks = effectsIterable.map((effect) =>
      Effect.gen(function* () {
        const result = yield* Effect.withConsole(effect, console);
        yield* Queue.offer(queue, { _tag: "Increment", amount: 1 });
        return result;
      }),
    );

    const exit = yield* Effect.exit(Effect.all(tasks, options));
    yield* Queue.offer(queue, { _tag: "Stop" });
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
        yield* Effect.logInfo("test info log from item", item);
        return yield* Effect.succeed(item);
      }),
    ),
  );
});

Effect.runPromise(program);
