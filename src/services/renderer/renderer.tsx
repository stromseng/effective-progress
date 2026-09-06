import { Context, Effect, Layer, type Scope } from "effect";
import { render } from "ink";
import { NowProvider } from "./context/now-context";
import { SpinnerProvider } from "./context/spinner-context";
import { ProgressRenderer } from "./public-api";
import { ProgressStore, type ProgressStoreService } from "../store/store";
import { useProgressRenderView } from "./hooks/use-progress-render-view";
import { ProgressStdio } from "../stdio";

interface RendererService {
  readonly start: Effect.Effect<void, never, Scope.Scope>;
}

const MAX_FPS = 24;

const ProgressRoot = ({ store }: { readonly store: ProgressStoreService }) => {
  const { renderSnapshot, hasRunningTasks, storeSnapshot } = useProgressRenderView(store);

  return (
    <SpinnerProvider active={hasRunningTasks}>
      <NowProvider active={hasRunningTasks}>
        <ProgressRenderer rows={renderSnapshot.rows} columns={storeSnapshot.columns} />
      </NowProvider>
    </SpinnerProvider>
  );
};

const makeRendererService = Effect.gen(function* () {
  const store = yield* ProgressStore;
  const stdio = yield* ProgressStdio;
  const proot = <ProgressRoot store={store} />;

  return {
    start: Effect.acquireRelease(
      Effect.sync(() =>
        render(proot, {
          stdout: stdio.stdout,
          stderr: stdio.stderr,
          patchConsole: true,
          exitOnCtrlC: false,
          debug: false,
          maxFps: MAX_FPS,
        }),
      ),
      (instance) =>
        Effect.sync(() => {
          store.flush();
          instance.rerender(proot);
          instance.unmount();
        }),
    ).pipe(Effect.as(undefined)),
  } satisfies RendererService;
});

export class Renderer extends Context.Service<Renderer, RendererService>()(
  "stromseng.dev/effective-progress/Renderer",
) {
  static readonly layer = Layer.effect(Renderer, makeRendererService);
}
