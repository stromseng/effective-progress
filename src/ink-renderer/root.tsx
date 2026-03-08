import { useSyncExternalStore } from "react";
import { ProgressApp } from "./app";
import type { ProgressRenderStore } from "./store";
import { useNowClock } from "./use-now-clock";
import { useSpinnerClock } from "./use-spinner-clock";

const SPINNER_INTERVAL_MILLIS = 100;
const NOW_INTERVAL_MILLIS = 1_000;

export interface ProgressRootProps {
  readonly store: ProgressRenderStore;
  readonly isTTY: boolean;
  readonly getTerminalColumns: () => number | undefined;
}

export const ProgressRoot = ({ store, isTTY, getTerminalColumns }: ProgressRootProps) => {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const tick = useSpinnerClock(snapshot.hasRunningTasks, SPINNER_INTERVAL_MILLIS);
  const now = useNowClock(snapshot.hasRunningTasks, NOW_INTERVAL_MILLIS);

  return (
    <ProgressApp
      rows={snapshot.rows}
      now={now}
      tick={tick}
      isTTY={isTTY}
      terminalColumns={getTerminalColumns()}
    />
  );
};
