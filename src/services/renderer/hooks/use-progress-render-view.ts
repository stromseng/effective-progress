import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ProgressStoreShape } from "../../store/store";
import type { TaskStore } from "../../../types";
import { toRenderSnapshot, type RenderSnapshot } from "../../store/render-snapshot";

interface ProgressRenderView {
  readonly storeSnapshot: TaskStore;
  readonly renderSnapshot: RenderSnapshot;
  readonly hasRunningTasks: boolean;
}

const useRenderSnapshot = (storeSnapshot: TaskStore): RenderSnapshot => {
  const previousSnapshotRef = useRef<RenderSnapshot | undefined>(undefined);

  const renderSnapshot = useMemo(
    () => toRenderSnapshot(storeSnapshot, previousSnapshotRef.current),
    [storeSnapshot],
  );

  useEffect(() => {
    previousSnapshotRef.current = renderSnapshot;
  }, [renderSnapshot]);

  return renderSnapshot;
};

export const useProgressRenderView = (store: ProgressStoreShape): ProgressRenderView => {
  const storeSnapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const renderSnapshot = useRenderSnapshot(storeSnapshot);

  return {
    storeSnapshot,
    renderSnapshot,
    hasRunningTasks: renderSnapshot.hasRunningTasks,
  };
};
