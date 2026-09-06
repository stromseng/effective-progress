import type { ColumnDef } from "./types";
import type { TaskSnapshot } from "../task-model";
import { Text } from "ink";
import { formatElapsed } from "./format";
import { useNow } from "../renderer/context/now-context";

const ElapsedCell = ({ task }: { readonly task: TaskSnapshot }) => {
  const now = useNow(task.status === "running");
  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsed(task, now)}
    </Text>
  );
};

export const elapsed = (): ColumnDef<unknown> => ({
  align: "right",
  flexShrink: 0,
  render: ({ task }) => <ElapsedCell task={task} />,
});
