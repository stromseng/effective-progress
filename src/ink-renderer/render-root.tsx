import { RootColumn } from "./columns/root-column";
import type { ProgressRenderStore } from "./store";
import { useProgressRenderView } from "./store/use-progress-render-view";

interface ProgressRootProps {
  readonly store: ProgressRenderStore;
  readonly getTerminalColumns: () => number | undefined;
}

export const ProgressRoot = ({ store, getTerminalColumns }: ProgressRootProps) => {
  const { renderSnapshot } = useProgressRenderView(store);

  return <RootColumn rows={renderSnapshot.rows} terminalColumns={getTerminalColumns()} />;
};
