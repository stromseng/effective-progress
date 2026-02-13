import { Effect, Console } from "effect";
import cliProgress from "cli-progress";

type AllOptions = Parameters<typeof Effect.all>[1];

const makeMultibarConsole = (multibar: cliProgress.MultiBar): Console.Console => {
  const log = (...args: ReadonlyArray<any>) =>
    Effect.sync(() => {
      multibar.log(args.map(String).join(" ") + "\n");
    });

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
        if (!condition) multibar.log(["Assertion failed:", ...args].map(String).join(" ") + "\n");
      },
      clear() {},
      count() {},
      countReset() {},
      debug(...args) {
        multibar.log(args.map(String).join(" ") + "\n");
      },
      dir(item) {
        multibar.log(String(item) + "\n");
      },
      dirxml(...args) {
        multibar.log(args.map(String).join(" ") + "\n");
      },
      error(...args) {
        multibar.log(args.map(String).join(" ") + "\n");
      },
      group() {},
      groupCollapsed() {},
      groupEnd() {},
      info(...args) {
        multibar.log(args.map(String).join(" ") + "\n");
      },
      log(...args) {
        multibar.log(args.map(String).join(" ") + "\n");
      },
      table(data) {
        multibar.log(String(data) + "\n");
      },
      time() {},
      timeEnd() {},
      timeLog() {},
      trace(...args) {
        multibar.log(args.map(String).join(" ") + "\n");
      },
      warn(...args) {
        multibar.log(args.map(String).join(" ") + "\n");
      },
    },
  };
};

const trackProgress = <A, E, R, Options extends AllOptions>(
  effectsIterable: Array<Effect.Effect<A, E, R>>,
  options?: Options,
) => {
  return Effect.gen(function* () {
    const multibar = new cliProgress.MultiBar(
      {
        clearOnComplete: true,
        hideCursor: true,
      },
      cliProgress.Presets.rect,
    );

    const b1 = multibar.create(effectsIterable.length, 0);
    const console = makeMultibarConsole(multibar);

    const tasks = effectsIterable.map((effect) =>
      Effect.gen(function* () {
        const rest = yield* Effect.withConsole(effect, console);
        b1.increment();
        return rest;
      }),
    );

    const results = yield* Effect.all(tasks, options);

    multibar.stop();

    return results;
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
