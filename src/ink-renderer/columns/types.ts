import type { TaskSnapshot } from "../../types";
import type { TaskTreeInfo } from "../types";

export interface ColumnProps {
  readonly task: TaskSnapshot;
  readonly tree: TaskTreeInfo;
  readonly now: number;
  readonly tick: number;
  readonly isTTY: boolean;
  readonly showTree: boolean;
  readonly amountSucceededWidth: number;
  readonly amountFailedWidth: number;
  readonly amountProcessedWidth: number;
  readonly amountTotalWidth: number;
}
