import { Box, Text } from "ink";
import { useNow } from "../context/now-context";
import { formatEta } from "../shared/format";
import type { TaskRowModel } from "../store/types";

const EtaCell = ({ row, now }: { readonly row: TaskRowModel; readonly now: number }) => {
  const eta = formatEta(row.task, now);

  if (eta === "") {
    return null;
  }

  return (
    <Text wrap="truncate-end" color="gray">
      {`ETA: ${eta}`}
    </Text>
  );
};

export const EtaColumn = ({ rows }: { readonly rows: ReadonlyArray<TaskRowModel> }) => {
  const now = useNow();
  const hasEta = rows.some((row) => formatEta(row.task, now) !== "");

  if (!hasEta) {
    return null;
  }

  return (
    <Box flexDirection="column" flexShrink={0}>
      {rows.map((row) => (
        <Box key={row.task.id as number} height={1} justifyContent="flex-end">
          <EtaCell row={row} now={now} />
        </Box>
      ))}
    </Box>
  );
};
