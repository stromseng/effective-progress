import { NowProvider } from "../now-context";
import type { ReactNode } from "react";
import { SpinnerProvider } from "../spinner-context";
import type { TaskRowModel } from "../store/types";
import { ColumnsLayout } from "./columns-layout";
import { RenderFrameProvider } from "../render-frame-context";

interface RootColumnInstance {
  render: () => ReactNode;
}

const emptyRootColumn = (stickyWidths: Map<symbol, number>): RootColumnInstance => {
  stickyWidths.clear();
  return {
    render: () => null,
  };
};

export const RootColumn = (
  rows: ReadonlyArray<TaskRowModel>,
  terminalColumns: number | undefined,
  stickyWidths: Map<symbol, number> = new Map(),
  spinnerTick?: number,
  nowOverride?: number,
): RootColumnInstance => {
  if (rows.length === 0) {
    return emptyRootColumn(stickyWidths);
  }

  const hasRunningTasks = rows.some((row) => row.task.status === "running");

  return {
    render: () => (
      <SpinnerProvider active={hasRunningTasks} tickOverride={spinnerTick}>
        <NowProvider active={hasRunningTasks} nowOverride={nowOverride}>
          <RenderFrameProvider rows={rows}>
            <ColumnsLayout terminalColumns={terminalColumns} />
          </RenderFrameProvider>
        </NowProvider>
      </SpinnerProvider>
    ),
  };
};
