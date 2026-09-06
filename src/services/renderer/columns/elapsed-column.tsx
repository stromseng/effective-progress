import { Text } from "ink";
import { memo } from "react";
import { formatElapsed } from "../shared/format";
import { useNow } from "../context/now-context";
import type { TaskRowModel } from "../../store/types";

export const ElapsedCell = memo(({ task }: { readonly task: TaskRowModel["task"] }) => {
  const now = useNow(task.status === "running");
  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsed(task, now)}
    </Text>
  );
});
