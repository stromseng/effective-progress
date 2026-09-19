import { Context, Effect, Layer, type Scope } from "effect";
import { render } from "ink";
import { NowClockProvider } from "./now-clock";
import { SpinnerClockProvider } from "./spinner-clock";
import { ProgressTable } from "./progress-table";
import { ProgressStore, type ProgressStoreService } from "../store/store";
import { useProgressRenderView } from "./render-view";
import { ProgressStdio } from "../stdio";

interface RendererService {
  readonly start: Effect.Effect<void, never, Scope.Scope>;
}

const MAX_FPS = 24;

const ProgressApp = ({ store }: { readonly store: ProgressStoreService }) => {
  const { rows, columns, hasRunningTasks } = useProgressRenderView(store);

  return (
    <SpinnerClockProvider active={hasRunningTasks}>
      <NowClockProvider active={hasRunningTasks}>
        <ProgressTable rows={rows} columns={columns} />
      </NowClockProvider>
    </SpinnerClockProvider>
  );
};

const makeRendererService = Effect.gen(function* () {
  const store = yield* ProgressStore;
  const stdio = yield* ProgressStdio;
  const root = <ProgressApp store={store} />;

  return {
    start: Effect.acquireRelease(
      Effect.sync(() =>
        render(root, {
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
          instance.rerender(root);
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
