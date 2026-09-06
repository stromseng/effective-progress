import type { ColumnDef } from "./types";
import type { TaskSnapshot } from "../task-model";
import { Text } from "ink";
import { formatEta } from "../renderer/shared/format";

const EtaCell = ({ task }: { readonly task: TaskSnapshot }) => {
  const eta = formatEta(task);

  if (eta === "") {
    return null;
  }

  return (
    <Text wrap="truncate-end" color="gray">
      {`ETA: ${eta}`}
    </Text>
  );
};

export const eta = (): ColumnDef<unknown> => ({
  align: "right",
  flexShrink: 0,
  minWidth: 8,
  render: ({ task }) => <EtaCell task={task} />,
});
