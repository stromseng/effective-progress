import { Box, Text } from "ink";
import type { TaskColumnDef, TaskId, TaskSnapshot } from "../../types";
import type { TaskRowModel } from "../store/types";

export interface MergedCustomColumn {
  readonly header: string;
  readonly renderers: Map<TaskId, (task: TaskSnapshot & { readonly metadata: unknown }) => string>;
  readonly align?: "left" | "right";
}

export const collectCustomColumns = (
  rows: ReadonlyArray<TaskRowModel>,
  columnDefs: Map<TaskId, ReadonlyArray<TaskColumnDef<unknown>>>,
): ReadonlyArray<MergedCustomColumn> => {
  const headerOrder: string[] = [];
  const headerToRenderers = new Map<
    string,
    {
      renderers: Map<TaskId, (task: TaskSnapshot & { readonly metadata: unknown }) => string>;
      align?: "left" | "right";
    }
  >();

  for (const row of rows) {
    const cols = columnDefs.get(row.task.id) ?? [];
    for (const col of cols) {
      if (!headerToRenderers.has(col.header)) {
        headerOrder.push(col.header);
        headerToRenderers.set(col.header, {
          renderers: new Map(),
          align: col.align,
        });
      }
      const entry = headerToRenderers.get(col.header)!;
      entry.renderers.set(
        row.task.id,
        col.render as (task: TaskSnapshot & { readonly metadata: unknown }) => string,
      );
    }
  }

  return headerOrder.map((header) => {
    const entry = headerToRenderers.get(header)!;
    return {
      header,
      renderers: entry.renderers,
      align: entry.align,
    };
  });
};

export const CustomColumn = ({
  column,
  rows,
}: {
  readonly column: MergedCustomColumn;
  readonly rows: ReadonlyArray<TaskRowModel>;
}) => (
  <Box flexDirection="column" flexShrink={0}>
    {rows.map((row) => {
      const renderer = column.renderers.get(row.task.id);
      return (
        <Box
          key={row.task.id as number}
          height={1}
          justifyContent={column.align === "right" ? "flex-end" : "flex-start"}
        >
          <Text wrap="truncate-end">
            {renderer ? renderer(row.task as TaskSnapshot & { readonly metadata: unknown }) : ""}
          </Text>
        </Box>
      );
    })}
  </Box>
);
