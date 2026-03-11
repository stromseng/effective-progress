import { useSyncExternalStore } from "react";
import { RootColumn } from "./columns/root-column";
import type { ProgressRenderStore } from "./store";

interface ProgressRootProps {
  readonly store: ProgressRenderStore;
  readonly getTerminalColumns: () => number | undefined;
}

export const ProgressRoot = ({ store, getTerminalColumns }: ProgressRootProps) => {
  const publication = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return <RootColumn rows={publication.snapshot.rows} terminalColumns={getTerminalColumns()} />;
};
