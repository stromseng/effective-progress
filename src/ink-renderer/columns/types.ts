import type { TaskSnapshot } from "../../types";
import type { TaskTreeInfo } from "../snapshot/types";

export interface ColumnProps {
  readonly task: TaskSnapshot;
  readonly tree: TaskTreeInfo;
  readonly now: number;
  readonly tick: number;
  readonly isTTY: boolean;
}
