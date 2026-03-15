import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { TaskSnapshot } from "../../types";
import { isDeterminate } from "../shared/determinate";
import { formatAmount } from "../shared/format";
import { textWidth } from "../shared/text-width";
import type { TaskRowModel } from "../store/types";

interface AmountLayout {
  readonly hasDetailedRows: boolean;
  readonly countWidth: number;
  readonly processedWidth: number;
  readonly totalWidth: number;
  readonly preferredWidth: number;
}

const hasUnknownTotalCounts = (task: TaskSnapshot): boolean =>
  task.units.total === undefined && task.units.processed > 0;

const hasCountedAmount = (task: TaskSnapshot): boolean =>
  isDeterminate(task) || hasUnknownTotalCounts(task);

const totalTextFor = (task: TaskSnapshot): string =>
  task.units.total === undefined ? "?" : `${task.units.total}`;

const emptyAmountLayout: AmountLayout = {
  hasDetailedRows: false,
  countWidth: 0,
  processedWidth: 0,
  totalWidth: 0,
  preferredWidth: 0,
};

const measureAmountLayout = (
  rows: ReadonlyArray<{ readonly task: TaskSnapshot }>,
): AmountLayout => {
  const countedTasks = rows.flatMap((row) => (hasCountedAmount(row.task) ? [row.task] : []));
  const hasDetailedRows = countedTasks.some((task) => task.countDisplay === "detailed");

  if (countedTasks.length === 0) {
    const preferredWidth = rows.reduce(
      (max, row) => Math.max(max, textWidth(formatAmount(row.task, 0))),
      0,
    );

    return {
      ...emptyAmountLayout,
      preferredWidth,
    };
  }

  const processedWidth = countedTasks.reduce(
    (max, task) => Math.max(max, `${task.units.processed}`.length),
    1,
  );
  const totalWidth = countedTasks.reduce(
    (max, task) => Math.max(max, totalTextFor(task).length),
    1,
  );
  const countWidth = hasDetailedRows
    ? countedTasks.reduce(
        (max, task) =>
          Math.max(
            max,
            processedWidth,
            totalWidth,
            `${task.units.succeeded}`.length,
            `${task.units.failed}`.length,
          ),
        1,
      )
    : 0;

  const countedWidth =
    (hasDetailedRows ? countWidth + 1 + countWidth + 1 : 0) + processedWidth + 1 + totalWidth;
  const preferredWidth = rows.reduce((max, row) => {
    if (hasCountedAmount(row.task)) {
      return Math.max(max, countedWidth);
    }

    return Math.max(max, textWidth(formatAmount(row.task, 0)));
  }, countedWidth);

  return {
    hasDetailedRows,
    countWidth,
    processedWidth,
    totalWidth,
    preferredWidth,
  };
};

const renderAmount = (task: TaskSnapshot, layout: AmountLayout): ReactNode => {
  if (!hasCountedAmount(task)) {
    return formatAmount(task, 0);
  }

  const processed = `${task.units.processed}`.padStart(layout.processedWidth, " ");
  const total = totalTextFor(task).padStart(layout.totalWidth, " ");

  if (!layout.hasDetailedRows) {
    return `${processed}/${total}`;
  }

  if (task.countDisplay !== "detailed") {
    return `${" ".repeat(layout.countWidth)} ${" ".repeat(layout.countWidth)} ${processed}/${total}`;
  }

  const succeeded = `${task.units.succeeded}`.padStart(layout.countWidth, " ");
  const failed = `${task.units.failed}`.padStart(layout.countWidth, " ");

  return (
    <>
      <Text color="green">{succeeded}</Text>
      <Text>{` `}</Text>
      <Text color="red">{failed}</Text>
      <Text>{` ${processed}/${total}`}</Text>
    </>
  );
};

export const AmountColumn = ({ rows }: { readonly rows: ReadonlyArray<TaskRowModel> }) => {
  const amountLayout = measureAmountLayout(rows);

  if (amountLayout.preferredWidth === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" flexShrink={0}>
      {rows.map((row) => (
        <Box key={row.task.id as number} height={1} justifyContent="flex-end">
          <Text wrap="truncate-end">{renderAmount(row.task, amountLayout)}</Text>
        </Box>
      ))}
    </Box>
  );
};
