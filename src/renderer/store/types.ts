import type { TaskSnapshot } from "../../types";

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

export interface TaskRowDerived {
  readonly treePrefix: string;
  readonly treePrefixWidth: number;
  readonly descriptionWidth: number;
  readonly treePrefixedDescriptionWidth: number;
  readonly hasRenderableProgress: boolean;
  readonly isDeterminate: boolean;
}

export interface TaskRowModel {
  readonly task: TaskSnapshot;
  readonly tree: TaskTreeInfo;
  readonly derived: TaskRowDerived;
}
