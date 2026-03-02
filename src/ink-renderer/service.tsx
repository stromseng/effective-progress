import { Clock, Context, Effect, Layer, Ref } from "effect";
import { render, type Instance } from "ink";
import type { ProgressStdioService } from "../stdio";
import type { TaskSnapshot, TaskStore } from "../types";
import { ProgressApp } from "./app";
import { toTaskRows } from "./model";

const RENDER_INTERVAL_MILLIS = 100;

export interface InkRendererService {
  readonly run: (
    storeRef: Ref.Ref<TaskStore>,
    dirtyRef: Ref.Ref<boolean>,
    stdio: ProgressStdioService,
    isTTY: boolean,
  ) => Effect.Effect<void>;
}

const hasRunningSpinners = (tasks: ReadonlyArray<TaskSnapshot>): boolean =>
  tasks.some(
    (task) => task.status === "running" && task.units._tag === "IndeterminateTaskUnits",
  );

const makeDefaultInkRenderer = (): InkRendererService => ({
  run: (storeRef, dirtyRef, stdio, isTTY) =>
    Effect.gen(function* () {
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
              stdout: stdio.stdout,
              stderr: stdio.stderr,
              patchConsole: true,
              exitOnCtrlC: false,
              debug: false,
            });
            return;
          }

          instance.rerender(app);
        });

      const renderLoop = Effect.gen(function* () {
        rendererActive = true;

        while (true) {
          const dirty = yield* Ref.getAndSet(dirtyRef, false);
          const store = yield* Ref.get(storeRef);
          const tasks = Array.from(store.tasks.values()).filter(
            (task) => !(task.transient && task.status !== "running"),
          );
          const shouldRender = dirty || hasRunningSpinners(tasks);

          if (shouldRender) {
            const now = yield* Clock.currentTimeMillis;
            const terminalColumns = isTTY ? stdio.stderr.columns : undefined;
            yield* renderStore(store, now, terminalColumns);
          }

          tick += 1;
          yield* Effect.sleep(RENDER_INTERVAL_MILLIS);
        }
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            if (rendererActive) {
              const store = yield* Ref.get(storeRef);
              const now = yield* Clock.currentTimeMillis;
              const terminalColumns = isTTY ? stdio.stderr.columns : undefined;
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
