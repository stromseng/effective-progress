import { Text } from "ink";
import { formatElapsed } from "../shared/format";
import type { TaskRowModel } from "../../store/types";

export const ElapsedCell = ({
  task,
  now,
}: {
  readonly task: TaskRowModel["task"];
  readonly now: number;
}) => {
  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsed(task, now)}
    </Text>
  );
};
