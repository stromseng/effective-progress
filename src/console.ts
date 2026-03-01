import { Console, Effect } from "effect";

export type BufferedConsoleMethod =
  | "assert"
  | "debug"
  | "dir"
  | "dirxml"
  | "error"
  | "group"
  | "groupCollapsed"
  | "groupEnd"
  | "info"
  | "log"
  | "table"
  | "trace"
  | "warn";

export interface BufferedConsoleCall {
  readonly method: BufferedConsoleMethod;
  readonly args: ReadonlyArray<unknown>;
  readonly unsafe: boolean;
}

export const makeProgressConsole = (
  appendLog: (call: BufferedConsoleCall) => Effect.Effect<void, never, never>,
): Console.Console => {
  const log = (method: BufferedConsoleMethod, ...args: ReadonlyArray<unknown>) =>
    appendLog({ method, args, unsafe: false });
  const unsafeLog = (method: BufferedConsoleMethod, ...args: ReadonlyArray<unknown>) => {
    Effect.runSync(appendLog({ method, args, unsafe: true }));
  };

  return Console.Console.of({
    [Console.TypeId]: Console.TypeId,
    assert: (condition, ...args) => log("assert", condition, ...args),
    clear: Effect.void,
    count: (_label) => Effect.void,
    countReset: (_label) => Effect.void,
    debug: (...args) => log("debug", ...args),
    dir: (item, options) => log("dir", item, options),
    dirxml: (...args) => log("dirxml", ...args),
    error: (...args) => log("error", ...args),
    group: (...args) => log("group", ...args),
    groupEnd: log("groupEnd"),
    info: (...args) => log("info", ...args),
    log: (...args) => log("log", ...args),
    table: (tabularData, properties) => log("table", tabularData, properties),
    time: (_label) => Effect.void,
    timeEnd: (_label) => Effect.void,
    timeLog: (_label, ...args) => log("info", ...args),
    trace: (...args) => log("trace", ...args),
    warn: (...args) => log("warn", ...args),
    unsafe: {
      assert(condition, ...args) {
        unsafeLog("assert", condition, ...args);
      },
      clear() {},
      count(_label) {},
      countReset(_label) {},
      debug(...args) {
        unsafeLog("debug", ...args);
      },
      dir(item, options) {
        unsafeLog("dir", item, options);
      },
      dirxml(...args) {
        unsafeLog("dirxml", ...args);
      },
      error(...args) {
        unsafeLog("error", ...args);
      },
      group(...args) {
        unsafeLog("group", ...args);
      },
      groupCollapsed(...args) {
        unsafeLog("groupCollapsed", ...args);
      },
      groupEnd() {
        unsafeLog("groupEnd");
      },
      info(...args) {
        unsafeLog("info", ...args);
      },
      log(...args) {
        unsafeLog("log", ...args);
      },
      table(tabularData, properties) {
        unsafeLog("table", tabularData, properties);
      },
      time(_label) {},
      timeEnd(_label) {},
      timeLog(_label, ...args) {
        unsafeLog("info", ...args);
      },
      trace(...args) {
        unsafeLog("trace", ...args);
      },
      warn(...args) {
        unsafeLog("warn", ...args);
      },
    },
  });
};
