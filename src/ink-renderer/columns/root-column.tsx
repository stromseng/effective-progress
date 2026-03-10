import type { ReactNode } from "react";
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
  now: number,
  tick: number,
  terminalColumns: number | undefined,
  stickyWidths: Map<symbol, number> = new Map(),
): RootColumnInstance => {
  if (rows.length === 0) {
    return emptyRootColumn(stickyWidths);
  }

  return {
    render: () => (
      <RenderFrameProvider rows={rows} now={now} tick={tick}>
        <ColumnsLayout terminalColumns={terminalColumns} />
      </RenderFrameProvider>
    ),
  };
};
