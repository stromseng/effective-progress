import { Effect } from "effect";
import { render } from "ink";
import type { ProgressStdioService } from "../services/stdio";
import { NowProvider } from "./context/now-context";
import { CreateProgressRenderer, type ProgressColumnDefinition } from "./public-api";
import { SpinnerProvider } from "./context/spinner-context";
import type { ProgressRenderStore } from "./store";
import { useProgressRenderView } from "./store/use-progress-render-view";

const MAX_FPS = 24;

const CreateProgressRoot = (columns: ReadonlyArray<ProgressColumnDefinition>) => {
  const ProgressRenderer = CreateProgressRenderer(columns);

  return ({
    store,
    getTerminalColumns,
    getTerminalRows,
  }: {
    readonly store: ProgressRenderStore;
    readonly getTerminalColumns: () => number | undefined;
    readonly getTerminalRows: () => number | undefined;
  }) => {
    const { renderSnapshot, hasRunningTasks } = useProgressRenderView(store);

    return (
      <SpinnerProvider active={hasRunningTasks}>
        <NowProvider active={hasRunningTasks}>
          <ProgressRenderer
            rows={renderSnapshot.rows}
            terminalColumns={getTerminalColumns()}
            terminalRows={getTerminalRows()}
          />
        </NowProvider>
      </SpinnerProvider>
    );
  };
};

export const makeRendererv2InkRendererService = (
  columns: ReadonlyArray<ProgressColumnDefinition>,
) => {
  const ProgressRoot = CreateProgressRoot(columns);

  return {
    run: (store: ProgressRenderStore, stdio: ProgressStdioService, isTTY: boolean) => {
      const proot = (
        <ProgressRoot
          store={store}
          getTerminalColumns={() => (isTTY ? stdio.stderr.columns : undefined)}
          getTerminalRows={() => (isTTY ? stdio.stderr.rows : undefined)}
        />
      );

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
