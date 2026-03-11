import { VirtualList } from "ink-virtual-list";
import { Box } from "ink";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  type FunctionComponent,
  type ReactElement,
} from "react";
import { useNow } from "../ink-renderer/now-context";
import type { TaskRowModel } from "../ink-renderer/store/types";
import { planColumnLayout } from "./width-allocator";
import { RENDERER_COLUMN_GAP } from "./width-allocator";

export interface ProgressColumnMeasurement {
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly preferredWidth: number;
}

export interface ProgressColumnProps {
  readonly row: TaskRowModel;
  readonly rowIndex: number;
  readonly width: number;
}

export type ProgressColumnComponent = FunctionComponent<ProgressColumnProps>;

export interface ProgressColumnMeasureContext {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly now: number;
}

export interface ProgressColumnDefinition {
  readonly Component: ProgressColumnComponent;
  readonly measure: (context: ProgressColumnMeasureContext) => ProgressColumnMeasurement;
  readonly getLayoutDependency?: (context: ProgressColumnMeasureContext) => string | number;
  readonly fixedWidth?: number;
  readonly noWrap?: boolean;
  readonly justify?: "left" | "right";
  readonly overflow?: "ellipsis" | "crop";
  readonly sticky?: boolean;
  readonly stickyMaxWidth?: number;
}

export interface ProgressRendererProps {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly terminalColumns?: number;
  readonly terminalRows?: number;
}

interface ProgressRowProps {
  readonly row: TaskRowModel;
  readonly rowIndex: number;
  readonly terminalColumns?: number;
  readonly columns: ReadonlyArray<{
    readonly definition: ProgressColumnDefinition;
    readonly width: number;
  }>;
}

const ProgressRow = memo(
  ({ row, rowIndex, terminalColumns, columns }: ProgressRowProps) => (
    <Box flexDirection="row" width={terminalColumns} columnGap={RENDERER_COLUMN_GAP}>
      {columns.map((column, columnIndex) => {
        const Component = column.definition.Component;

        return (
          <Box
            key={columnIndex}
            height={1}
            width={column.width}
            minWidth={column.width}
            flexBasis={column.width}
            flexGrow={0}
            flexShrink={0}
            justifyContent={column.definition.justify === "right" ? "flex-end" : "flex-start"}
          >
            <Component row={row} rowIndex={rowIndex} width={column.width} />
          </Box>
        );
      })}
    </Box>
  ),
  (previousProps, nextProps) =>
    previousProps.row === nextProps.row &&
    previousProps.rowIndex === nextProps.rowIndex &&
    previousProps.terminalColumns === nextProps.terminalColumns &&
    previousProps.columns === nextProps.columns,
);

const layoutDependencyKeyFor = (
  columns: ReadonlyArray<ProgressColumnDefinition>,
  context: ProgressColumnMeasureContext,
): string =>
  columns
    .map((column, index) => `${index}:${column.getLayoutDependency?.(context) ?? "static"}`)
    .join("|");

export const CreateProgressRenderer = (
  columns: ReadonlyArray<ProgressColumnDefinition>,
): ((props: ProgressRendererProps) => ReactElement | null) => {
  return ({ rows, terminalColumns, terminalRows }: ProgressRendererProps) => {
    const stickyWidthsRef = useRef(new Map<number, number>());
    const now = useNow();
    const layoutContext = { rows, now };
    const layoutDependencyKey = layoutDependencyKeyFor(columns, layoutContext);

    const layout = useMemo(
      () =>
        rows.length === 0
          ? { columns: [], nextStickyWidths: new Map<number, number>() }
          : planColumnLayout(columns, rows, now, terminalColumns, stickyWidthsRef.current),
      [columns, layoutDependencyKey, rows, terminalColumns],
    );

    useEffect(() => {
      stickyWidthsRef.current = rows.length === 0 ? new Map() : layout.nextStickyWidths;
    }, [layout.nextStickyWidths, rows.length]);

    if (layout.columns.length === 0) {
      return null;
    }

    return (
      <VirtualList
        items={rows as Array<TaskRowModel>} // readonly not compatible, so we have to cast
        keyExtractor={(row) => `${row.task.id as number}`}
        selectedIndex={Math.max(0, rows.length - 1)}
        height={terminalRows ?? "auto"}
        itemHeight={1}
        showOverflowIndicators={true}
        renderItem={({ item: row, index: rowIndex }) => (
          <ProgressRow
            row={row}
            rowIndex={rowIndex}
            terminalColumns={terminalColumns}
            columns={layout.columns}
          />
        )}
      />
    );
  };
};
