import type { ColumnDef } from "./types";
import type { TaskSnapshot } from "../task-model";
import { Text } from "ink";
import { formatElapsedEta } from "../renderer/shared/format";
import { useNow } from "../renderer/context/now-context";

const ElapsedEtaCell = ({ task }: { readonly task: TaskSnapshot }) => {
  const now = useNow(task.status === "running");
  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsedEta(task, now)}
    </Text>
  );
};

export const elapsedEta = (): ColumnDef<unknown> => ({
  align: "right",
  flexShrink: 0,
  minWidth: 11,
  render: ({ task }) => <ElapsedEtaCell task={task} />,
});
