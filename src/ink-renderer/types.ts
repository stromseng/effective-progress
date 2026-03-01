import type { TaskSnapshot } from "../types";

export interface TaskTreeInfo {
  readonly depth: number;
  readonly hasNextSibling: boolean;
  readonly hasChildren: boolean;
  readonly ancestorHasNextSibling: ReadonlyArray<boolean>;
}

export interface OrderedTask {
  readonly snapshot: TaskSnapshot;
  readonly depth: number;
}

export interface TaskRowModel {
  readonly task: TaskSnapshot;
  readonly tree: TaskTreeInfo;
}
