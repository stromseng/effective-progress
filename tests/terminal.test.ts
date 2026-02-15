import { describe, expect, test } from "bun:test";
import { Effect, Exit, Fiber } from "effect";
import * as Progress from "../src";

interface StdinSpyState {
  readonly resumeCalls: number;
  readonly pauseCalls: number;
  readonly rawModeCalls: ReadonlyArray<boolean>;
}

const withPatchedTTYStdin = async <A>(
  f: (state: StdinSpyState) => Promise<A>,
): Promise<{ result: A; state: StdinSpyState }> => {
  const stdin = process.stdin as NodeJS.ReadStream & {
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => NodeJS.ReadStream;
  };
  const state = {
    resumeCalls: 0,
    pauseCalls: 0,
    rawModeCalls: [] as Array<boolean>,
  };

  const originalIsTTY = Object.getOwnPropertyDescriptor(stdin, "isTTY");
  const originalIsRaw = Object.getOwnPropertyDescriptor(stdin, "isRaw");
  const originalResume = stdin.resume;
  const originalPause = stdin.pause;
  const originalSetRawMode = stdin.setRawMode;

  Object.defineProperty(stdin, "isTTY", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(stdin, "isRaw", {
    configurable: true,
    writable: true,
    value: false,
  });

  stdin.resume = function patchedResume() {
    state.resumeCalls += 1;
    return stdin;
  };
  stdin.pause = function patchedPause() {
    state.pauseCalls += 1;
    return stdin;
  };
  stdin.setRawMode = function patchedSetRawMode(mode: boolean) {
    state.rawModeCalls.push(mode);
    Object.defineProperty(stdin, "isRaw", {
      configurable: true,
      writable: true,
      value: mode,
    });
    return stdin;
  };

  try {
    const result = await f(state);
    return { result, state };
  } finally {
    stdin.resume = originalResume;
    stdin.pause = originalPause;
    stdin.setRawMode = originalSetRawMode;

    if (originalIsTTY) {
      Object.defineProperty(stdin, "isTTY", originalIsTTY);
    } else {
      delete (stdin as { isTTY?: boolean }).isTTY;
    }

    if (originalIsRaw) {
      Object.defineProperty(stdin, "isRaw", originalIsRaw);
    } else {
      delete (stdin as { isRaw?: boolean }).isRaw;
    }
  }
};

describe("ProgressTerminal", () => {
  test("mock service can override rows and columns independently", async () => {
    const mock: Progress.ProgressTerminalService = {
      isTTY: Effect.succeed(false),
      stderrRows: Effect.succeed(12),
      stderrColumns: Effect.succeed(80),
      writeStderr: () => Effect.void,
      withRawInputCapture: (innerEffect) => innerEffect,
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const terminal = yield* Progress.ProgressTerminal;
        return {
          rows: yield* terminal.stderrRows,
          columns: yield* terminal.stderrColumns,
        };
      }).pipe(Effect.provideService(Progress.ProgressTerminal, mock)),
    );

    expect(result.rows).toBe(12);
    expect(result.columns).toBe(80);
  });

  test("live service restores raw mode on failure", async () => {
    const { state } = await withPatchedTTYStdin(async () => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const terminal = yield* Progress.ProgressTerminal;
          return yield* terminal.withRawInputCapture(Effect.fail("boom"));
        }).pipe(Effect.provide(Progress.ProgressTerminal.Default)),
      );

      expect(Exit.isFailure(exit)).toBeTrue();
      return undefined;
    });

    expect(state.resumeCalls).toBeGreaterThanOrEqual(1);
    expect(state.pauseCalls).toBeGreaterThanOrEqual(1);
    expect(state.rawModeCalls).toEqual([true, false]);
  });

  test("live service restores raw mode on interruption", async () => {
    const { state } = await withPatchedTTYStdin(async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const interruptible = Effect.gen(function* () {
            const terminal = yield* Progress.ProgressTerminal;
            return yield* terminal.withRawInputCapture(Effect.never);
          }).pipe(Effect.provide(Progress.ProgressTerminal.Default));

          const fiber = yield* Effect.fork(interruptible);
          yield* Effect.sleep("5 millis");
          yield* Fiber.interrupt(fiber);
        }),
      );
    });

    expect(state.resumeCalls).toBeGreaterThanOrEqual(1);
    expect(state.pauseCalls).toBeGreaterThanOrEqual(1);
    expect(state.rawModeCalls).toEqual([true, false]);
  });

  test("live service relays ctrl-c data as SIGINT", async () => {
    const originalKill = process.kill;
    const observedSignals: Array<NodeJS.Signals | number | undefined> = [];

    (process as { kill: typeof process.kill }).kill = ((pid: number, signal?: NodeJS.Signals) => {
      if (pid === process.pid) {
        observedSignals.push(signal);
      }
      return true;
    }) as typeof process.kill;

    try {
      await withPatchedTTYStdin(async () => {
        await Effect.runPromise(
          Effect.gen(function* () {
            const terminal = yield* Progress.ProgressTerminal;
            yield* terminal.withRawInputCapture(
              Effect.sync(() => {
                process.stdin.emit("data", Buffer.from([3]));
              }),
            );
          }).pipe(Effect.provide(Progress.ProgressTerminal.Default)),
        );
      });
    } finally {
      (process as { kill: typeof process.kill }).kill = originalKill;
    }

    expect(observedSignals.includes("SIGINT")).toBeTrue();
  });
});
