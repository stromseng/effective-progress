import { useSyncExternalStore } from "react";
import { RootColumn } from "./columns/root-column";
import type { ProgressRenderStore } from "./store";
import { useRenderSnapshot } from "./store/use-render-snapshot";

interface ProgressRootProps {
  readonly store: ProgressRenderStore;
  readonly getTerminalColumns: () => number | undefined;
}

export const ProgressRoot = ({ store, getTerminalColumns }: ProgressRootProps) => {
  const publication = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const renderSnapshot = useRenderSnapshot(publication.snapshot);

  return <RootColumn rows={renderSnapshot.rows} terminalColumns={getTerminalColumns()} />;
};
