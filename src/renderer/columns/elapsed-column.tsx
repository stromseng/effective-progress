import { Box, Text } from "ink";
import { useNow } from "../context/now-context";
import { formatElapsed } from "../shared/format";
import type { TaskRowModel } from "../store/types";

export const ElapsedCell = ({
  task,
  now,
}: {
  readonly task: TaskRowModel["task"];
  readonly now: number;
}) => {
  return (
    <Text wrap="truncate-end" color="gray">
      {formatElapsed(task, now)}
    </Text>
  );
};

export const ElapsedColumn = ({ rows }: { readonly rows: ReadonlyArray<TaskRowModel> }) => {
  const now = useNow();

  return (
    <Box flexDirection="column" flexShrink={0}>
      {rows.map((row) => (
        <Box key={row.task.id as number} height={1} justifyContent="flex-end">
          <ElapsedCell task={row.task} now={now} />
        </Box>
      ))}
    </Box>
  );
};
