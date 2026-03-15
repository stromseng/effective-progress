import { Box } from "ink";
import type { ReactElement } from "react";
import type { TaskColumnDef, TaskId } from "../types";
import { AmountColumn } from "./columns/amount-column";
import { BarColumn } from "./columns/bar-column";
import { CustomColumn, collectCustomColumns } from "./columns/custom-column";
import { DescriptionColumn } from "./columns/description-column";
import { ElapsedColumn } from "./columns/elapsed-column";
import { EtaColumn } from "./columns/eta-column";
import type { TaskRowModel } from "./store/types";

interface ProgressRendererProps {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly columns: Map<TaskId, ReadonlyArray<TaskColumnDef<unknown>>>;
}

export const ProgressRenderer = ({ rows, columns }: ProgressRendererProps): ReactElement | null => {
  if (rows.length === 0) {
    return null;
  }

  const customColumns = collectCustomColumns(rows, columns);

  return (
    <Box flexDirection="row" columnGap={1}>
      <DescriptionColumn rows={rows} />
      <BarColumn rows={rows} />
      <AmountColumn rows={rows} />
      <ElapsedColumn rows={rows} />
      <EtaColumn rows={rows} />
      {customColumns.map((column) => (
        <CustomColumn key={column.header} column={column} rows={rows} />
      ))}
    </Box>
  );
};
