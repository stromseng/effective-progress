import { Predicate } from "effect";
import { Box, Text, useBoxMetrics, type DOMElement } from "ink";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import type { ColumnAlign, Column } from "../columns/types";
import type { TaskId } from "../task-model";
import { resolveColumns, type ResolvedColumnPosition } from "./column-layout";
import type { CellInfo } from "../columns/types";

interface ProgressTableProps {
  readonly rows: ReadonlyArray<CellInfo>;
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
      {position.rows.map((row, rowIndex) => {
        const column = position.entries[rowIndex];
        const output =
          column?.render(row, {
            width: hasMeasured ? width : position.flexBasis,
          }) ?? null;

        return (
          <Box key={row.task.id} height={1} justifyContent={justifyContentForAlign(column?.align)}>
            <RenderedNode node={output} />
          </Box>
        );
      })}
    </Box>
  );
};

export const ProgressTable = ({ rows, columns }: ProgressTableProps): ReactElement | null => {
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
