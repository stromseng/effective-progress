import type { Column } from "./types";
import type { TaskSnapshot } from "../tasks/model";
import { Text } from "ink";
import { formatElapsed } from "./format";
import { useNow } from "../renderer/now-clock";

const ElapsedCell = ({ task }: { readonly task: TaskSnapshot }) => {
  const now = useNow(task.status === "running");
  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsed(task, now)}
    </Text>
  );
};

export const elapsed = (): Column<unknown> => ({
  align: "right",
  flexShrink: 0,
  render: ({ task }) => <ElapsedCell task={task} />,
});
