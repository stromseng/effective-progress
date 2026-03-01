import { Console, Effect, Ref } from "effect";

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

export interface ConsoleBridge {
  readonly progressConsole: Console.Console;
  readonly appendLog: (call: BufferedConsoleCall) => Effect.Effect<void, never, never>;
  readonly replayLogs: (
    logs: ReadonlyArray<BufferedConsoleCall>,
  ) => Effect.Effect<void, never, never>;
  readonly log: (...args: ReadonlyArray<unknown>) => Effect.Effect<void, never, never>;
}

const replayBufferedConsoleCall = (
  outerConsole: Console.Console,
  call: BufferedConsoleCall,
): Effect.Effect<void, never, never> => {
  type DirOptions = Parameters<Console.Console["dir"]>[1];
  type GroupOptions = Parameters<Console.Console["group"]>[0];

  switch (call.method) {
    case "assert": {
      const [condition, ...rest] = call.args;
      return outerConsole.assert(condition as boolean, ...rest);
    }
    case "debug":
      return outerConsole.debug(...call.args);
    case "dir":
      return outerConsole.dir(call.args[0], call.args[1] as DirOptions);
    case "dirxml":
      return outerConsole.dirxml(...call.args);
    case "error":
      return outerConsole.error(...call.args);
    case "group":
      return outerConsole.group(call.args[0] as GroupOptions);
    case "groupCollapsed":
      return outerConsole.group(call.args[0] as GroupOptions);
    case "groupEnd":
      return outerConsole.groupEnd;
    case "info":
      return outerConsole.info(...call.args);
    case "log":
      return outerConsole.log(...call.args);
    case "table":
      return outerConsole.table(call.args[0], call.args[1] as ReadonlyArray<string> | undefined);
    case "trace":
      return outerConsole.trace(...call.args);
    case "warn":
      return outerConsole.warn(...call.args);
  }
};

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

export const makeConsoleBridge = (
  outerConsole: Console.Console,
  pendingLogsRef: Ref.Ref<ReadonlyArray<BufferedConsoleCall>>,
  markDirty: Effect.Effect<void, never, never>,
): ConsoleBridge => {
  const appendLog = (call: BufferedConsoleCall) =>
    call.args.length === 0
      ? Effect.void
      : Ref.update(pendingLogsRef, (logs) => [...logs, call]).pipe(Effect.zipRight(markDirty));

  const replayLogs = (logs: ReadonlyArray<BufferedConsoleCall>) =>
    Effect.forEach(logs, (call) => replayBufferedConsoleCall(outerConsole, call), {
      discard: true,
    });

  const log = (...args: ReadonlyArray<unknown>) =>
    args.length === 0 ? Effect.void : appendLog({ method: "log", args, unsafe: false });

  return {
    progressConsole: makeProgressConsole(appendLog),
    appendLog,
    replayLogs,
    log,
  };
};
