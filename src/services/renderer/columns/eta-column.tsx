import { Text } from "ink";
import { memo } from "react";
import { formatEta } from "../shared/format";
import type { TaskRowModel } from "../../store/types";

export const EtaCell = memo(({ task }: { readonly task: TaskRowModel["task"] }) => {
  const eta = formatEta(task);

  if (eta === "") {
    return null;
  }

  return (
    <Text wrap="truncate-end" color="gray">
      {`ETA: ${eta}`}
    </Text>
  );
});
