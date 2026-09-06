import { Predicate } from "effect";
import { Box, Text, useBoxMetrics, type DOMElement } from "ink";
import type { ReactElement, ReactNode } from "react";
import { memo, useRef } from "react";
import type { ColumnAlign, Column, TaskId } from "../../types";
import { resolveColumns, type ResolvedColumnPosition } from "./column-resolver";
import type { ResolvedColumn } from "./column-runtime";
import type { TaskRowModel } from "../store/types";

interface ProgressRendererProps {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly columns: ReadonlyMap<TaskId, ReadonlyArray<Column>>;
}

const justifyContentForAlign = (align: ColumnAlign | undefined) => {
  if (align === "right") {
    return "flex-end";
  }
  if (align === "center") {
    return "center";
  }
  return "flex-start";
};

const RenderedNode = ({ node }: { readonly node: ReactNode }) => {
  if (Predicate.isString(node) || Predicate.isNumber(node)) {
    return <Text wrap="truncate-end">{node}</Text>;
  }

  return node;
};

interface ColumnCellProps {
  readonly row: TaskRowModel;
  readonly column: ResolvedColumn | undefined;
  readonly width: number | undefined;
}

const ColumnCell = memo(
  ({ row, column, width }: ColumnCellProps) => (
    <Box height={1} justifyContent={justifyContentForAlign(column?.align)}>
      <RenderedNode node={column?.render(row, { width }) ?? null} />
    </Box>
  ),
  (previous, next) =>
    previous.row === next.row &&
    previous.width === next.width &&
    previous.column?.definition === next.column?.definition &&
    Object.is(previous.column?.prepared, next.column?.prepared),
);

const ColumnPosition = ({ position }: { readonly position: ResolvedColumnPosition }) => {
  const ref = useRef<DOMElement>(null!);
  const { width, hasMeasured } = useBoxMetrics(ref);

  return (
    <Box
      ref={ref}
      flexDirection="column"
      flexGrow={position.flexGrow}
      flexShrink={position.flexShrink ?? 0}
      flexBasis={position.flexBasis}
      minWidth={position.minWidth}
    >
      {position.rows.map((row, rowIndex) => (
        <ColumnCell
          key={row.task.id}
          row={row}
          column={position.entries[rowIndex]}
          width={hasMeasured ? width : position.flexBasis}
        />
      ))}
    </Box>
  );
};

export const ProgressRenderer = ({ rows, columns }: ProgressRendererProps): ReactElement | null => {
  if (rows.length === 0) {
    return null;
  }

  const positions = resolveColumns(rows, columns);

  return (
    <Box flexDirection="row" columnGap={1} overflow="hidden">
      {positions.map((position) => (
        <ColumnPosition key={position.index} position={position} />
      ))}
    </Box>
  );
};
