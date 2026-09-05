import { Box, Text, useBoxMetrics, type DOMElement } from "ink";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import type { ColumnAlign, ColumnDef, TaskId } from "../../types";
import { useNow } from "./context/now-context";
import { useSpinnerTick } from "./context/spinner-context";
import { resolveColumns, type ResolvedColumnPosition } from "./column-resolver";
import type { TaskRowModel } from "../store/types";

interface ProgressRendererProps {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly columns: ReadonlyMap<TaskId, ReadonlyArray<ColumnDef<any, any>>>;
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
  if (typeof node === "string" || typeof node === "number") {
    return <Text wrap="truncate-end">{node}</Text>;
  }

  return node;
};

const ColumnPosition = ({ position }: { readonly position: ResolvedColumnPosition }) => {
  const ref = useRef<DOMElement>(null!);
  const { width, hasMeasured } = useBoxMetrics(ref);
  const now = useNow();
  const spinnerTick = useSpinnerTick();

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
        const entry = position.entries[rowIndex];
        const column = entry?.column;
        const cell = row;
        const output =
          column?.render(cell, {
            width: hasMeasured ? width : position.flexBasis,
            now,
            spinnerTick,
            prepared: entry?.prepared as never,
          }) ?? null;

        return (
          <Box
            key={row.task.id as number}
            height={1}
            justifyContent={justifyContentForAlign(column?.align)}
          >
            <RenderedNode node={output} />
          </Box>
        );
      })}
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
