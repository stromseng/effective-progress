import { Context, Effect, Layer } from "effect";
import { render } from "ink";
import type { ProgressRenderStore } from "../ink-renderer/store";
import { ProgressRoot } from "../ink-renderer/render-root";
import type { ProgressStdioService } from "./stdio";

const MAX_FPS = 12;

interface InkRendererService {
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
