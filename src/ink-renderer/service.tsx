import { Context, Effect, Layer } from "effect";
import { render } from "ink";
import type { ProgressStdioService } from "../stdio";
import { ProgressRoot } from "./root";
import type { ProgressRenderStore } from "./store";

const MAX_FPS = 12;

export interface InkRendererService {
  readonly run: (
    store: ProgressRenderStore,
    stdio: ProgressStdioService,
    isTTY: boolean,
  ) => Effect.Effect<void>;
}

const makeDefaultInkRenderer = (): InkRendererService => ({
  run: (store, stdio, isTTY) =>
    Effect.sync(() =>
      render(
        <ProgressRoot
          store={store}
          isTTY={isTTY}
          getTerminalColumns={() => (isTTY ? stdio.stderr.columns : undefined)}
        />,
        {
          stdout: stdio.stdout,
          stderr: stdio.stderr,
          patchConsole: true,
          exitOnCtrlC: false,
          debug: false,
          maxFps: MAX_FPS,
        },
      ),
    ).pipe(
      Effect.flatMap((instance) =>
        Effect.never.pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              store.flush();
              yield* Effect.sleep("0 millis");
              yield* Effect.sync(() => {
                instance.unmount();
              });
            }),
          ),
        ),
      ),
    ),
});

export class InkRenderer extends Context.Tag("stromseng.dev/effective-progress/InkRenderer")<
  InkRenderer,
  InkRendererService
>() {
  static readonly Default = Layer.succeed(InkRenderer, InkRenderer.of(makeDefaultInkRenderer()));
}
