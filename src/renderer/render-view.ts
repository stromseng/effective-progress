import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ProgressStoreService } from "../store/store";
import type { ProgressState } from "../store/state";
import { prepareRows, type RenderView } from "./prepare-rows";

interface ProgressRenderView extends RenderView {
  readonly columns: ProgressState["columns"];
}

const useRenderView = (publishedState: ProgressState): RenderView => {
  const previousViewRef = useRef<RenderView | undefined>(undefined);

  const renderView = useMemo(
    () => prepareRows(publishedState, previousViewRef.current),
    [publishedState],
  );

  useEffect(() => {
    previousViewRef.current = renderView;
  }, [renderView]);

  return renderView;
};

export const useProgressRenderView = (store: ProgressStoreService): ProgressRenderView => {
  const publishedState = useSyncExternalStore(
    store.subscribe,
    store.getPublishedState,
    store.getPublishedState,
  );
  const renderView = useRenderView(publishedState);

  return {
    rows: renderView.rows,
    columns: publishedState.columns,
    hasRunningTasks: renderView.hasRunningTasks,
  };
};
