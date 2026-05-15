import { Context, Effect, Layer } from "effect";
import { render } from "ink";
import { NowProvider } from "./context/now-context";
import { SpinnerProvider } from "./context/spinner-context";
import { ProgressRenderer } from "./public-api";
import { ProgressStore, type ProgressStoreShape } from "../store/store";
import { useProgressRenderView } from "./hooks/use-progress-render-view";
import { ProgressStdio } from "../stdio";

interface RendererShape {
  readonly run: Effect.Effect<void>;
}

const MAX_FPS = 24;

const ProgressRoot = ({ store }: { readonly store: ProgressStoreShape }) => {
  const { renderSnapshot, hasRunningTasks, publication } = useProgressRenderView(store);

  return (
    <SpinnerProvider active={hasRunningTasks}>
      <NowProvider active={hasRunningTasks}>
        <ProgressRenderer rows={renderSnapshot.rows} columns={publication.snapshot.columns} />
      </NowProvider>
    </SpinnerProvider>
  );
};

const makeRendererv2InkRendererService = Effect.gen(function* () {
  const store = yield* ProgressStore;
  const stdio = yield* ProgressStdio;
  const proot = <ProgressRoot store={store} />;

  return {
    run: Effect.sync(() =>
      render(proot, {
        stdout: stdio.stdout,
        stderr: stdio.stderr,
        patchConsole: true,
        exitOnCtrlC: false,
        debug: false,
        maxFps: MAX_FPS,
      }),
    ).pipe(
      Effect.flatMap((instance) =>
        Effect.never.pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              store.flush();
              instance.rerender(proot);
              yield* Effect.sync(() => {
                instance.unmount();
              });
            }),
          ),
        ),
      ),
    ),
  } satisfies RendererShape;
});

export class Renderer extends Context.Tag("stromseng.dev/effective-progress/Renderer")<
  Renderer,
  RendererShape
>() {
  static readonly Default = Layer.effect(Renderer, makeRendererv2InkRendererService);
}
