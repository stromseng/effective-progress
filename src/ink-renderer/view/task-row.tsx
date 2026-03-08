import { Box } from "ink";
import type { FrameLayout } from "../columns/layout";
import type { TaskRowModel } from "../snapshot/types";

export interface TaskRowProps {
  readonly row: TaskRowModel;
  readonly layout: FrameLayout;
}

export const TaskRow = ({ row, layout }: TaskRowProps) => {
  return (
    <Box flexDirection="row" minWidth={layout.rowWidth}>
      {layout.columns.map((column, index) => (
        <Box
          key={column.id}
          width={column.width}
          flexShrink={column.id === "description" ? 1 : 0}
          marginRight={index < layout.columns.length - 1 ? 1 : 0}
        >
          {column.renderCell(row, column.width)}
        </Box>
      ))}
    </Box>
  );
};
