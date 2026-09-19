import type { ReactNode } from "react";
import type { TaskSnapshot } from "../tasks/model";

export type ColumnAlign = "left" | "center" | "right";

export interface TaskTreeInfo {
  readonly depth: number;
  readonly hasNextSibling: boolean;
  readonly ancestorHasNextSibling: ReadonlyArray<boolean>;
}

export interface TaskRowDerived {
  readonly treePrefix: string;
  readonly treePrefixWidth: number;
  readonly descriptionWidth: number;
}

/** All data available to a column cell. */
export interface TaskRow<M = unknown> {
  readonly task: TaskSnapshot & { readonly metadata: M };
  readonly tree: TaskTreeInfo;
  readonly derived: TaskRowDerived;
}

export interface CellContext<P = void> {
  readonly width?: number;
  readonly prepared: P;
}

export type ColumnSizeValue<P = void> = number | ((prepared: P) => number | undefined);

type BivariantCallback<Args extends ReadonlyArray<unknown>, R> = {
  bivarianceHack: (...args: Args) => R;
}["bivarianceHack"];

export interface Column<M = unknown, P = void> {
  /**
   * Runs once per shared function identity at each column position, using only the rows whose
   * columns share that function. Define it at module scope to share preparation across tasks;
   * allocating it inside a column factory creates a separate group for every factory call.
   */
  readonly prepare?: BivariantCallback<[rows: ReadonlyArray<TaskRow<M>>], P>;
  readonly render: BivariantCallback<[cell: TaskRow<M>, ctx: CellContext<P>], ReactNode>;
  readonly align?: ColumnAlign;
  readonly flexGrow?: ColumnSizeValue<P>;
  readonly flexShrink?: ColumnSizeValue<P>;
  readonly flexBasis?: ColumnSizeValue<P>;
  readonly minWidth?: ColumnSizeValue<P>;
}

/** Heterogeneous storage erases prepared types and, by default, metadata. Task options retain M. */
export type AnyColumn<M = any> = Column<M, any>;
