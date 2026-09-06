import type { ReactNode } from "react";
import type { TaskSnapshot } from "../task-model";

export type ColumnAlign = "left" | "center" | "right";

export interface TaskTreeInfo {
  readonly depth: number;
  readonly hasNextSibling: boolean;
  readonly hasChildren: boolean;
  readonly ancestorHasNextSibling: ReadonlyArray<boolean>;
}

export interface TaskRowDerived {
  readonly treePrefix: string;
  readonly treePrefixWidth: number;
  readonly descriptionWidth: number;
  readonly treePrefixedDescriptionWidth: number;
  readonly hasRenderableProgress: boolean;
  readonly isDeterminate: boolean;
}

/** All data available to a column cell. */
export interface CellInfo<M = unknown> {
  readonly task: TaskSnapshot & { readonly metadata: M };
  readonly tree: TaskTreeInfo;
  readonly derived: TaskRowDerived;
}

export interface ColumnRenderContext<P = void> {
  readonly width?: number;
  readonly prepared: P;
}

export type ColumnSizeValue<P = void> = number | ((prepared: P) => number | undefined);

type BivariantCallback<Args extends ReadonlyArray<unknown>, R> = {
  bivarianceHack: (...args: Args) => R;
}["bivarianceHack"];

export interface ColumnDef<M = unknown, P = void> {
  readonly prepare?: BivariantCallback<[rows: ReadonlyArray<CellInfo<M>>], P>;
  readonly render: BivariantCallback<[cell: CellInfo<M>, ctx: ColumnRenderContext<P>], ReactNode>;
  readonly align?: ColumnAlign;
  readonly flexGrow?: ColumnSizeValue<P>;
  readonly flexShrink?: ColumnSizeValue<P>;
  readonly flexBasis?: ColumnSizeValue<P>;
  readonly minWidth?: ColumnSizeValue<P>;
}

/** Heterogeneous storage erases prepared types and, by default, metadata. Task options retain M. */
export type Column<M = any> = ColumnDef<M, any>;
