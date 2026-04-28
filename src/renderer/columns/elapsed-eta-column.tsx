import { Text } from "ink";
import { formatElapsedEta } from "../shared/format";
import type { TaskRowModel } from "../store/types";

export const ElapsedEtaCell = ({
  task,
  now,
}: {
  readonly task: TaskRowModel["task"];
  readonly now: number;
}) => {
  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsedEta(task, now)}
    </Text>
  );
};
