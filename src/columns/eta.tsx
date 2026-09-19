import type { Column } from "./types";
import type { TaskSnapshot } from "../tasks/model";
import { Text } from "ink";
import { formatEta } from "./format";

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

export const eta = (): Column<unknown> => ({
  align: "right",
  flexShrink: 0,
  minWidth: 8,
  render: ({ task }) => <EtaCell task={task} />,
});
