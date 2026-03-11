import { useEffect, useMemo, useRef } from "react";
import type { TaskStore } from "../../types";
import { toRenderSnapshot, type RenderSnapshot } from "./render-snapshot";

export const useRenderSnapshot = (storeSnapshot: TaskStore): RenderSnapshot => {
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
