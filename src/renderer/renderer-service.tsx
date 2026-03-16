import { Effect } from "effect";
import { render } from "ink";
import type { ProgressStdioService } from "../services/stdio";
import { NowProvider } from "./context/now-context";
import { ProgressRenderer } from "./public-api";
import { SpinnerProvider } from "./context/spinner-context";
import type { ProgressRenderStore } from "./store";
import { useProgressRenderView } from "./store/use-progress-render-view";

const MAX_FPS = 24;

const ProgressRoot = ({ store }: { readonly store: ProgressRenderStore }) => {
  const { renderSnapshot, hasRunningTasks, publication } = useProgressRenderView(store);

  return (
    <SpinnerProvider active={hasRunningTasks}>
      <NowProvider active={hasRunningTasks}>
        <ProgressRenderer rows={renderSnapshot.rows} columns={publication.snapshot.columns} />
      </NowProvider>
    </SpinnerProvider>
  );
};

export const makeRendererv2InkRendererService = () => {
  return {
    run: (store: ProgressRenderStore, stdio: ProgressStdioService) => {
      const proot = <ProgressRoot store={store} />;

      return Effect.sync(() =>
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
      );
    },
  };
};
