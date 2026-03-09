import { Box } from "ink";
import { useRef } from "react";
import { useSyncExternalStore } from "react";
import { RootColumn } from "../columns/root-column";
import type { ProgressRenderStore } from "../store";
import { useNowClock } from "./hooks/use-now-clock";
import { useSpinnerClock } from "./hooks/use-spinner-clock";

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
  const stickyWidths = useRef(new Map<string, number>());
  const rootColumn = RootColumn(
    snapshot.rows,
    now,
    tick,
    getTerminalColumns(),
    isTTY,
    stickyWidths.current,
  );

  return <Box flexDirection="row">{rootColumn.render()}</Box>;
};
