import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ProgressStoreService } from "../../services/store/store";
import type { ProgressState } from "../../services/store/types";
import { prepareRows, type RenderSnapshot } from "../prepare-rows";

interface ProgressRenderView extends RenderSnapshot {
  readonly columns: ProgressState["columns"];
}

const useRenderSnapshot = (storeSnapshot: ProgressState): RenderSnapshot => {
  const previousSnapshotRef = useRef<RenderSnapshot | undefined>(undefined);

  const renderSnapshot = useMemo(
    () => prepareRows(storeSnapshot, previousSnapshotRef.current),
    [storeSnapshot],
  );

  useEffect(() => {
    previousSnapshotRef.current = renderSnapshot;
  }, [renderSnapshot]);

  return renderSnapshot;
};

export const useProgressRenderView = (store: ProgressStoreService): ProgressRenderView => {
  const storeSnapshot = useSyncExternalStore(
    store.subscribe,
    store.getPublishedSnapshot,
    store.getPublishedSnapshot,
  );
  const renderSnapshot = useRenderSnapshot(storeSnapshot);

  return {
    rows: renderSnapshot.rows,
    columns: storeSnapshot.columns,
    hasRunningTasks: renderSnapshot.hasRunningTasks,
  };
};
