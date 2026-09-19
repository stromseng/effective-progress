import type { Column } from "./types";
import type { TaskSnapshot } from "../tasks/model";
import { Text } from "ink";
import { formatElapsedEta } from "./format";
import { useNow } from "../renderer/now-clock";

const ElapsedEtaCell = ({ task }: { readonly task: TaskSnapshot }) => {
  const now = useNow(task.status === "running");
  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsedEta(task, now)}
    </Text>
  );
};

export const elapsedEta = (): Column<unknown> => ({
  align: "right",
  flexShrink: 0,
  minWidth: 11,
  render: ({ task }) => <ElapsedEtaCell task={task} />,
});
