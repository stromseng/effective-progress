import { Text } from "ink";
import { formatElapsedEta } from "../shared/format";
import { useNow } from "../context/now-context";
import type { TaskRowModel } from "../../store/types";

export const ElapsedEtaCell = ({ task }: { readonly task: TaskRowModel["task"] }) => {
  const now = useNow(task.status === "running");
  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsedEta(task, now)}
    </Text>
  );
};
