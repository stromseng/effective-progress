import { Context, Effect, Layer } from "effect";

export interface ProgressTerminalService {
  readonly isTTY: Effect.Effect<boolean>;
  readonly stderrRows: Effect.Effect<number | undefined>;
  readonly stderrColumns: Effect.Effect<number | undefined>;
  readonly writeStderr: (text: string) => Effect.Effect<void>;
  readonly withRawInputCapture: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

const withRawInputCapture: ProgressTerminalService["withRawInputCapture"] = (effect) =>
  Effect.suspend(() => {
    if (!process.stdin.isTTY) {
      return effect;
    }

    const stdin = process.stdin;
    const wasRaw = Boolean(stdin.isRaw);
    const onData = (chunk: Buffer) => {
      if (chunk.length === 1 && chunk[0] === 3) {
        process.kill(process.pid, "SIGINT");
      }
    };

    return Effect.acquireUseRelease(
      Effect.sync(() => {
        stdin.resume();
        stdin.setRawMode?.(true);
        stdin.on("data", onData);
      }),
      () => effect,
      () =>
        Effect.sync(() => {
          try {
            stdin.off("data", onData);
            stdin.setRawMode?.(wasRaw);
            stdin.pause();
          } catch {
            // Best effort terminal restoration.
          }
        }),
    );
  });

export class ProgressTerminal extends Context.Tag("stromseng.dev/ProgressTerminal")<
  ProgressTerminal,
  ProgressTerminalService
>() {
  static readonly Default = Layer.succeed(ProgressTerminal, {
    isTTY: Effect.sync(() => Boolean(process.stderr.isTTY)),
    stderrRows: Effect.sync(() => process.stderr.rows),
    stderrColumns: Effect.sync(() => process.stderr.columns),
    writeStderr: (text) =>
      Effect.sync(() => {
        process.stderr.write(text);
      }),
    withRawInputCapture,
  } satisfies ProgressTerminalService);
}
