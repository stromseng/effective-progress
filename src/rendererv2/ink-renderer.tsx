import { Effect } from "effect";
import { render } from "ink";
import { useSyncExternalStore } from "react";
import { NowProvider } from "../ink-renderer/now-context";
import { SpinnerProvider } from "../ink-renderer/spinner-context";
import type { ProgressRenderStore } from "../ink-renderer/store";
import { InkRenderer } from "../services/ink-renderer";
import type { ProgressStdioService } from "../services/stdio";
import { CreateProgressRenderer, type ProgressColumnDefinition } from "./public-api";

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
    const publication = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

    return (
      <SpinnerProvider active={publication.snapshot.hasRunningTasks}>
        <NowProvider active={publication.snapshot.hasRunningTasks}>
          <ProgressRenderer
            rows={publication.snapshot.rows}
            terminalColumns={getTerminalColumns()}
            terminalRows={getTerminalRows()}
          />
        </NowProvider>
      </SpinnerProvider>
    );
  };
};

export const createRendererv2InkRenderer = (columns: ReadonlyArray<ProgressColumnDefinition>) => {
  const ProgressRoot = CreateProgressRoot(columns);

  return InkRenderer.of({
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
  });
};
