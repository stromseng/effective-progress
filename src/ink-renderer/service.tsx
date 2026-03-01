import { Writable } from "node:stream";
import { Clock, Context, Effect, Layer, Ref } from "effect";
import { render, type Instance } from "ink";
import type { BufferedConsoleCall } from "../console";
import type { ProgressTerminalService } from "../terminal";
import type { TaskSnapshot, TaskStore } from "../types";
import { ProgressApp } from "./app";
import { toTaskRows } from "./model";

const RENDER_INTERVAL_MILLIS = 100;

export interface InkRendererService {
  readonly run: (
    storeRef: Ref.Ref<TaskStore>,
    pendingLogsRef: Ref.Ref<ReadonlyArray<BufferedConsoleCall>>,
    replayLogs: (logs: ReadonlyArray<BufferedConsoleCall>) => Effect.Effect<void, never, never>,
    dirtyRef: Ref.Ref<boolean>,
    terminal: ProgressTerminalService,
    isTTY: boolean,
  ) => Effect.Effect<void>;
}

const hasRunningSpinners = (tasks: ReadonlyArray<TaskSnapshot>): boolean =>
  tasks.some(
    (task) => task.status === "running" && task.units._tag === "IndeterminateTaskUnits",
  );

const createInkWritable = (terminal: ProgressTerminalService): Writable =>
  new Writable({
    write(chunk, _encoding, callback) {
      try {
        const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : `${chunk}`;
        Effect.runSync(terminal.writeStderr(text));
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });

const makeDefaultInkRenderer = (): InkRendererService => ({
  run: (storeRef, pendingLogsRef, replayLogs, dirtyRef, terminal, isTTY) =>
    Effect.gen(function* () {
      const output = createInkWritable(terminal);
      let instance: Instance | undefined;
      let tick = 0;
      let rendererActive = false;

      const renderStore = (
        store: TaskStore,
        now: number,
        terminalColumns: number | undefined,
      ) =>
        Effect.sync(() => {
          const app = (
            <ProgressApp
              rows={toTaskRows(store)}
              now={now}
              tick={tick}
              isTTY={isTTY}
              terminalColumns={terminalColumns}
            />
          );
          if (instance === undefined) {
            instance = render(app, {
              stdout: output as unknown as NodeJS.WriteStream,
              stderr: output as unknown as NodeJS.WriteStream,
              patchConsole: true,
              exitOnCtrlC: false,
              debug: false,
            });
            return;
          }

          instance.rerender(app);
        });

      const flushLogs = (logs: ReadonlyArray<BufferedConsoleCall>) =>
        Effect.gen(function* () {
          if (logs.length === 0) {
            return;
          }
          yield* replayLogs(logs);
        });

      const renderLoop = Effect.gen(function* () {
        rendererActive = true;

        while (true) {
          const dirty = yield* Ref.getAndSet(dirtyRef, false);
          const store = yield* Ref.get(storeRef);
          const tasks = Array.from(store.tasks.values()).filter(
            (task) => !(task.transient && task.status !== "running"),
          );
          const hasPendingLogs = (yield* Ref.get(pendingLogsRef)).length > 0;
          const shouldRender = dirty || hasRunningSpinners(tasks) || hasPendingLogs;

          if (shouldRender) {
            const drainedLogs = yield* Ref.getAndSet(pendingLogsRef, []);
            yield* flushLogs(drainedLogs);
            const now = yield* Clock.currentTimeMillis;
            const terminalColumns = isTTY ? yield* terminal.stderrColumns : undefined;
            yield* renderStore(store, now, terminalColumns);
          }

          tick += 1;
          yield* Effect.sleep(RENDER_INTERVAL_MILLIS);
        }
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            const drainedLogs = yield* Ref.getAndSet(pendingLogsRef, []);
            yield* flushLogs(drainedLogs);

            if (rendererActive) {
              const store = yield* Ref.get(storeRef);
              const now = yield* Clock.currentTimeMillis;
              const terminalColumns = isTTY ? yield* terminal.stderrColumns : undefined;
              yield* renderStore(store, now, terminalColumns);
            }

            yield* Effect.sync(() => {
              instance?.unmount();
            });
          }),
        ),
      );

      return yield* renderLoop;
    }),
});

export class InkRenderer extends Context.Tag("stromseng.dev/effective-progress/InkRenderer")<
  InkRenderer,
  InkRendererService
>() {
  static readonly Default = Layer.succeed(InkRenderer, InkRenderer.of(makeDefaultInkRenderer()));
}
