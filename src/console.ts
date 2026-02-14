import { Console, Effect } from "effect";
import { formatWithOptions } from "node:util";

export const makeProgressConsole = (
  progressLog: (...args: ReadonlyArray<unknown>) => Effect.Effect<void, never, never>,
  outerConsole: Console.Console,
): Console.Console => {
  const log = (...args: ReadonlyArray<unknown>) => progressLog(...args);
  const unsafeLog = (...args: ReadonlyArray<unknown>) => {
    Effect.runFork(progressLog(...args));
  };

  const delegate = (effect: Effect.Effect<void, never, never>) => effect;

  return {
    [Console.TypeId]: Console.TypeId,
    assert(condition, ...args) {
      return condition ? Effect.void : log("Assertion failed:", ...args);
    },
    clear: Effect.void,
    count: (_label) => Effect.void,
    countReset: (_label) => Effect.void,
    debug: (...args) => log(...args),
    dir: (item, options) => log(formatWithOptions(options ?? {}, "%O", item)),
    dirxml: (...args) => log(...args),
    error: (...args) => log(...args),
    group: (...args) => log(...args),
    groupEnd: Effect.void,
    info: (...args) => log(...args),
    log: (...args) => log(...args),
    table: (tabularData, properties) => log(tabularData, properties),
    time: (_label) => Effect.void,
    timeEnd: (_label) => Effect.void,
    timeLog: (_label, ...args) => log(...args),
    trace: (...args) => delegate(outerConsole.trace(...args)),
    warn: (...args) => log(...args),
    unsafe: {
      assert(condition, ...args) {
        if (!condition) unsafeLog("Assertion failed:", ...args);
      },
      clear() {},
      count(_label) {},
      countReset(_label) {},
      debug(...args) {
        unsafeLog(...args);
      },
      dir(item, options) {
        unsafeLog(formatWithOptions(options ?? {}, "%O", item));
      },
      dirxml(...args) {
        unsafeLog(...args);
      },
      error(...args) {
        unsafeLog(...args);
      },
      group(...args) {
        unsafeLog(...args);
      },
      groupCollapsed(...args) {
        unsafeLog(...args);
      },
      groupEnd() {},
      info(...args) {
        unsafeLog(...args);
      },
      log(...args) {
        unsafeLog(...args);
      },
      table(tabularData, properties) {
        unsafeLog(tabularData, properties);
      },
      time(_label) {},
      timeEnd(_label) {},
      timeLog(_label, ...args) {
        unsafeLog(...args);
      },
      trace(...args) {
        outerConsole.unsafe.trace(...args);
      },
      warn(...args) {
        unsafeLog(...args);
      },
    },
  };
};
