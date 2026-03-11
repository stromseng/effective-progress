import { Box } from "ink";
import { useEffect, useMemo, useRef, type FunctionComponent, type ReactElement } from "react";
import type { TaskRowModel } from "../ink-renderer/store/types";
import { planColumnLayout } from "./width-allocator.sketch";

export interface ProgressColumnMeasurement {
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly preferredWidth: number;
}

export interface ProgressColumnProps {
  readonly row: TaskRowModel;
  readonly rowIndex: number;
  readonly now: number;
  readonly tick: number;
  readonly width: number;
}

export type ProgressColumnComponent = FunctionComponent<ProgressColumnProps>;

export interface ProgressColumnDefinition {
  readonly Component: ProgressColumnComponent;
  readonly measure: (rows: ReadonlyArray<TaskRowModel>) => ProgressColumnMeasurement;
  readonly fixedWidth?: number;
  readonly noWrap?: boolean;
  readonly justify?: "left" | "right";
  readonly overflow?: "ellipsis" | "crop";
  readonly paddingRight?: number;
  readonly sticky?: boolean;
  readonly stickyMaxWidth?: number;
}

export interface ProgressRendererProps {
  readonly rows: ReadonlyArray<TaskRowModel>;
  readonly now: number;
  readonly tick: number;
  readonly terminalColumns?: number;
}

export const CreateProgressRenderer = (
  columns: ReadonlyArray<ProgressColumnDefinition>,
): ((props: ProgressRendererProps) => ReactElement | null) => {
  return ({ rows, now, tick, terminalColumns }: ProgressRendererProps) => {
    const stickyWidthsRef = useRef(new Map<number, number>());

    const layout = useMemo(
      () =>
        rows.length === 0
          ? { columns: [], nextStickyWidths: new Map<number, number>() }
          : planColumnLayout(columns, rows, terminalColumns, stickyWidthsRef.current),
      [columns, now, rows, terminalColumns, tick],
    );

    useEffect(() => {
      stickyWidthsRef.current = rows.length === 0 ? new Map() : layout.nextStickyWidths;
    }, [layout.nextStickyWidths, rows.length]);

    if (layout.columns.length === 0) {
      return null;
    }

    return (
      <Box flexDirection="row" width={terminalColumns}>
        {layout.columns.map((column, columnIndex) => {
          const Component = column.definition.Component;

          return (
            <Box
              key={columnIndex}
              flexDirection="column"
              width={column.width}
              minWidth={column.width}
              flexBasis={column.width}
              flexGrow={0}
              flexShrink={0}
              marginRight={column.paddingRight}
            >
              {rows.map((row, rowIndex) => (
                <Box
                  key={row.task.id as number}
                  height={1}
                  width={column.width}
                  minWidth={column.width}
                  justifyContent={column.definition.justify === "right" ? "flex-end" : "flex-start"}
                >
                  <Component
                    row={row}
                    rowIndex={rowIndex}
                    now={now}
                    tick={tick}
                    width={column.width}
                  />
                </Box>
              ))}
            </Box>
          );
        })}
      </Box>
    );
  };
};
