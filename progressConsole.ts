import { Console, Deferred, Effect, Queue, Schema } from "effect";
import { formatWithOptions } from "node:util";

export class LogEvent extends Schema.TaggedClass<LogEvent>()("Log", {
  message: Schema.String,
}) {}

export class IncrementEvent extends Schema.TaggedClass<IncrementEvent>()("Increment", {
  amount: Schema.Number,
}) {}

export class StopEvent extends Schema.TaggedClass<StopEvent>()("Stop", {}) {}

export class DelegateEvent extends Schema.TaggedClass<DelegateEvent>()("Delegate", {
  effect: Schema.Any,
  ack: Schema.optional(Schema.Any),
}) {
  declare readonly effect: Effect.Effect<void, never, never>;
  declare readonly ack?: Deferred.Deferred<void>;
}

const ProgressEventSchema = Schema.Union(LogEvent, IncrementEvent, StopEvent, DelegateEvent);

export type ProgressEvent = typeof ProgressEventSchema.Type;
export const decodeProgressEvent = Schema.decodeSync(ProgressEventSchema);

export const makeProgressConsole = (
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

  const log = (...args: ReadonlyArray<any>) => Queue.offer(queue, new LogEvent({ message: formatArgs(args) }));

  const unsafeLog = (...args: ReadonlyArray<any>) => {
    Queue.unsafeOffer(queue, new LogEvent({ message: formatArgs(args) }));
  };

  const delegate = (effect: Effect.Effect<void, never, never>) =>
    Effect.gen(function* () {
      const ack = yield* Deferred.make<void>();
      yield* Queue.offer(queue, new DelegateEvent({ effect, ack }));
      yield* Deferred.await(ack);
    });

  const unsafeDelegate = (effect: Effect.Effect<void, never, never>) => {
    Queue.unsafeOffer(queue, new DelegateEvent({ effect }));
  };

  return {
    [Console.TypeId]: Console.TypeId,
    assert(condition, ...args) {
      return condition ? Effect.void : log("Assertion failed:", ...args);
    },
    clear: delegate(outerConsole.clear),
    count: (label) => delegate(outerConsole.count(label)),
    countReset: (label) => delegate(outerConsole.countReset(label)),
    debug: (...args) => log(...args),
    dir: (item, options) => delegate(outerConsole.dir(item, options)),
    dirxml: (...args) => delegate(outerConsole.dirxml(...args)),
    error: (...args) => log(...args),
    group: (...args) => delegate(outerConsole.group(...args)),
    groupEnd: delegate(outerConsole.groupEnd),
    info: (...args) => log(...args),
    log: (...args) => log(...args),
    table: (tabularData, properties) => delegate(outerConsole.table(tabularData, properties)),
    time: (label) => delegate(outerConsole.time(label)),
    timeEnd: (label) => delegate(outerConsole.timeEnd(label)),
    timeLog: (label, ...args) => delegate(outerConsole.timeLog(label, ...args)),
    trace: (...args) => delegate(outerConsole.trace(...args)),
    warn: (...args) => log(...args),
    unsafe: {
      assert(condition, ...args) {
        if (!condition) unsafeLog("Assertion failed:", ...args);
      },
      clear() {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.clear()));
      },
      count(label) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.count(label)));
      },
      countReset(label) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.countReset(label)));
      },
      debug(...args) {
        unsafeLog(...args);
      },
      dir(item, options) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.dir(item, options)));
      },
      dirxml(...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.dirxml(...args)));
      },
      error(...args) {
        unsafeLog(...args);
      },
      group(...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.group(...args)));
      },
      groupCollapsed(...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.groupCollapsed(...args)));
      },
      groupEnd() {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.groupEnd()));
      },
      info(...args) {
        unsafeLog(...args);
      },
      log(...args) {
        unsafeLog(...args);
      },
      table(tabularData, properties) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.table(tabularData, properties)));
      },
      time(label) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.time(label)));
      },
      timeEnd(label) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.timeEnd(label)));
      },
      timeLog(label, ...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.timeLog(label, ...args)));
      },
      trace(...args) {
        unsafeDelegate(Effect.sync(() => outerConsole.unsafe.trace(...args)));
      },
      warn(...args) {
        unsafeLog(...args);
      },
    },
  };
};
