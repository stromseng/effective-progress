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
  }: {
    readonly store: ProgressRenderStore;
    readonly getTerminalColumns: () => number | undefined;
  }) => {
    const publication = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

    return (
      <SpinnerProvider active={publication.snapshot.hasRunningTasks}>
        <NowProvider active={publication.snapshot.hasRunningTasks}>
          <ProgressRenderer
            rows={publication.snapshot.rows}
            terminalColumns={getTerminalColumns()}
          />
        </NowProvider>
      </SpinnerProvider>
    );
  };
};

export const createRendererv2InkRenderer = (columns: ReadonlyArray<ProgressColumnDefinition>) => {
  const ProgressRoot = CreateProgressRoot(columns);

  return InkRenderer.of({
    run: (store: ProgressRenderStore, stdio: ProgressStdioService, isTTY: boolean) =>
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
            incrementalRendering: false,
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
};
