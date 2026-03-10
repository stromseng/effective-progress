import { useSyncExternalStore } from "react";
import { RootColumn } from "./columns/root-column";
import type { ProgressRenderStore } from "./store";
import { useNowClock } from "./hooks/use-now-clock";
import { useSpinnerClock } from "./hooks/use-spinner-clock";

const SPINNER_INTERVAL_MILLIS = 100;
const NOW_INTERVAL_MILLIS = 1_000;

interface ProgressRootProps {
  readonly store: ProgressRenderStore;
  readonly getTerminalColumns: () => number | undefined;
}

export const ProgressRoot = ({ store, getTerminalColumns }: ProgressRootProps) => {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const tick = useSpinnerClock(snapshot.hasRunningTasks, SPINNER_INTERVAL_MILLIS);
  const now = useNowClock(snapshot.hasRunningTasks, NOW_INTERVAL_MILLIS);
  const rootColumn = RootColumn(snapshot.rows, now, tick, getTerminalColumns());

  return rootColumn.render();
};
