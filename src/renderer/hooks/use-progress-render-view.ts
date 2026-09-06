import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ProgressStoreService } from "../../services/store/store";
import type { ProgressState } from "../../services/store/types";
import { prepareRows, type RenderSnapshot } from "../prepare-rows";

interface ProgressRenderView {
  readonly storeSnapshot: ProgressState;
  readonly renderSnapshot: RenderSnapshot;
  readonly hasRunningTasks: boolean;
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
    storeSnapshot,
    renderSnapshot,
    hasRunningTasks: renderSnapshot.hasRunningTasks,
  };
};
