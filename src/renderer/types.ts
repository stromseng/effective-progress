import type { TaskSnapshot } from "../types";

/**
 * Defines how a column claims width during the shrink/fit stage.
 */
export type ColumnTrack =
  | {
      readonly _tag: "Auto";
    }
  | {
      readonly _tag: "Fixed";
      readonly width: number;
    }
  | {
      readonly _tag: "Fraction";
      readonly weight: number;
    };

export const Track = {
  auto: (): ColumnTrack => ({ _tag: "Auto" }),
  fixed: (width: number): ColumnTrack => ({
    _tag: "Fixed",
    width: Math.max(0, Math.floor(width)),
  }),
  fr: (weight = 1): ColumnTrack => ({
    _tag: "Fraction",
    weight: Math.max(0.001, weight),
  }),
} as const;

/**
 * Tree relationship metadata for rendering connectors.
 */
export interface TaskTreeInfo {
  readonly depth: number;
  readonly hasNextSibling: boolean;
  readonly hasChildren: boolean;
  readonly ancestorHasNextSibling: ReadonlyArray<boolean>;
}

export type CellWrapMode = "truncate" | "ellipsis";

export interface ProgressColumnContext {
  readonly task: TaskSnapshot;
  readonly depth: number;
  readonly tree: TaskTreeInfo;
  readonly now: number;
  readonly tick: number;
  readonly isTTY: boolean;
}

export interface ProgressColumnVariant {
  readonly measure?: (context: ProgressColumnContext) => number;
  readonly render: (context: ProgressColumnContext, width: number) => string;
}

export interface ProgressColumn {
  readonly id: string;
  readonly track?: ColumnTrack;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly collapsePriority?: number;
  readonly wrapMode?: CellWrapMode;
  readonly measure?: (context: ProgressColumnContext) => number;
  readonly render: (context: ProgressColumnContext, width: number) => string;
  readonly variants?: (context: ProgressColumnContext) => ReadonlyArray<ProgressColumnVariant>;
}
