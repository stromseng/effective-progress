import { NowProvider } from "../now-context";
import type { ReactNode } from "react";
import { SpinnerProvider } from "../spinner-context";
import type { TaskRowModel } from "../store/types";
import { ColumnsLayout } from "./columns-layout";
import { RenderFrameProvider } from "../render-frame-context";

const emptyRootColumn = (stickyWidths: Map<symbol, number>) => {
  stickyWidths.clear();
  return null;
};

interface RootColumnProps {
  rows: ReadonlyArray<TaskRowModel>;
  terminalColumns: number | undefined;
  stickyWidths?: Map<symbol, number>;
  spinnerTick?: number;
  nowOverride?: number;
}

export const RootColumn = ({
  rows,
  terminalColumns,
  stickyWidths = new Map(),
  spinnerTick,
  nowOverride,
}: RootColumnProps) => {
  if (rows.length === 0) {
    return emptyRootColumn(stickyWidths);
  }

  const hasRunningTasks = rows.some((row) => row.task.status === "running");

  return (
    <SpinnerProvider active={hasRunningTasks} tickOverride={spinnerTick}>
      <NowProvider active={hasRunningTasks} nowOverride={nowOverride}>
        <RenderFrameProvider rows={rows}>
          <ColumnsLayout terminalColumns={terminalColumns} />
        </RenderFrameProvider>
      </NowProvider>
    </SpinnerProvider>
  );
};
