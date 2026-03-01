import { Box } from "ink";
import { DEFAULT_BAR_WIDTH, type SharedColumnWidths } from "./layout";
import type { TaskRowModel } from "./types";
import {
  AmountColumn,
  BarColumn,
  DescriptionColumn,
  ElapsedColumn,
  EtaColumn,
} from "./columns";

export interface TaskRowProps {
  readonly row: TaskRowModel;
  readonly now: number;
  readonly tick: number;
  readonly isTTY: boolean;
  readonly widths: SharedColumnWidths;
}

export const TaskRow = ({ row, now, tick, isTTY, widths }: TaskRowProps) => {
  const props = {
    task: row.task,
    tree: row.tree,
    now,
    tick,
    isTTY,
    showTree: widths.showTree,
  } as const;

  return (
    <Box flexDirection="row" minWidth={widths.row}>
      <Box width={widths.description} flexShrink={1} marginRight={1}>
        <DescriptionColumn {...props} />
      </Box>
      {widths.bar > 0 ? (
        <Box width={widths.bar} flexShrink={0} marginRight={1}>
          <BarColumn {...props} width={Math.max(1, Math.min(widths.bar, DEFAULT_BAR_WIDTH))} />
        </Box>
      ) : null}
      <Box width={widths.amount} flexShrink={0} marginRight={1}>
        <AmountColumn {...props} />
      </Box>
      <Box width={widths.elapsed} flexShrink={0} marginRight={1}>
        <ElapsedColumn {...props} />
      </Box>
      {widths.eta > 0 ? (
        <Box width={widths.eta} flexShrink={0}>
          <EtaColumn {...props} />
        </Box>
      ) : null}
    </Box>
  );
};
