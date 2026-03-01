import { Text } from "ink";
import { formatEta } from "../format";
import type { ColumnProps } from "./types";

export const EtaColumn = ({ task, now }: ColumnProps) => {
  if (task.status !== "running" || task.units._tag !== "DeterminateTaskUnits") {
    return <Text />;
  }

  const eta = formatEta(task, now);
  const text = eta.length > 0 ? `ETA: ${eta}` : "ETA: --";

  return (
    <Text wrap="truncate-end" color="gray">
      {text}
    </Text>
  );
};
