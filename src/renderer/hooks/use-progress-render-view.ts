import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ProgressStoreService } from "../../services/store/store";
import type { TaskStore } from "../../types";
import { prepareRows, type RenderSnapshot } from "../prepare-rows";

interface ProgressRenderView {
  readonly storeSnapshot: TaskStore;
  readonly renderSnapshot: RenderSnapshot;
  readonly hasRunningTasks: boolean;
}

const useRenderSnapshot = (storeSnapshot: TaskStore): RenderSnapshot => {
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
    storeSnapshot,
    renderSnapshot,
    hasRunningTasks: renderSnapshot.hasRunningTasks,
  };
};
