import { Text } from "ink";
import { formatEta } from "../shared/format";
import type { TaskRowModel } from "../../store/types";

export const EtaCell = ({ task }: { readonly task: TaskRowModel["task"] }) => {
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
