import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ProgressRenderStore, RenderPublication } from "../store";
import { toRenderSnapshot, type RenderSnapshot } from "./render-snapshot";

export interface ProgressRenderView {
  readonly publication: RenderPublication;
  readonly renderSnapshot: RenderSnapshot;
  readonly hasRunningTasks: boolean;
}

const useRenderSnapshot = (storeSnapshot: RenderPublication["snapshot"]): RenderSnapshot => {
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

export const useProgressRenderView = (store: ProgressRenderStore): ProgressRenderView => {
  const publication = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const renderSnapshot = useRenderSnapshot(publication.snapshot);
  const hasRunningTasks = renderSnapshot.rows.some((row) => row.task.status === "running");

  return {
    publication,
    renderSnapshot,
    hasRunningTasks,
  };
};
