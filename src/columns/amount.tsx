import type { TaskRow, Column } from "./types";
import type { TaskSnapshot } from "../tasks/model";
import { Text } from "ink";
import { getAmountParts } from "./amount-parts";
import { textWidth } from "../terminal/text-width";

export interface AmountPrepared {
  readonly hasDetailedRows: boolean;
  readonly countWidth: number;
  readonly processedWidth: number;
  readonly totalWidth: number;
  readonly preferredWidth: number;
}

const prepareAmount = (rows: ReadonlyArray<TaskRow<unknown>>): AmountPrepared => {
  let hasDetailedRows = false;
  let countWidth = 0;
  let processedWidth = 0;
  let totalWidth = 0;
  let indicatorWidth = 0;

  for (const row of rows) {
    const parts = getAmountParts(row.task);
    if (parts.kind === "indicator") {
      indicatorWidth = Math.max(indicatorWidth, textWidth(parts.text));
      continue;
    }
    hasDetailedRows ||= parts.detailed;
    processedWidth = Math.max(processedWidth, parts.processed.length);
    totalWidth = Math.max(totalWidth, parts.total.length);
    countWidth = Math.max(countWidth, parts.succeeded.length, parts.failed.length);
  }

  countWidth = hasDetailedRows ? Math.max(countWidth, processedWidth, totalWidth) : 0;
  const countedWidth =
    processedWidth === 0
      ? 0
      : (hasDetailedRows ? 2 * (countWidth + 1) : 0) + processedWidth + 1 + totalWidth;
  return {
    hasDetailedRows,
    countWidth,
    processedWidth,
    totalWidth,
    preferredWidth: Math.max(indicatorWidth, countedWidth),
  };
};

const AmountValue = ({
  task,
  prepared,
}: {
  readonly task: TaskSnapshot;
  readonly prepared: AmountPrepared;
}) => {
  const parts = getAmountParts(task);
  if (parts.kind === "indicator") {
    return parts.text;
  }

  const processed = parts.processed.padStart(prepared.processedWidth, " ");
  const total = parts.total.padStart(prepared.totalWidth, " ");

  if (!prepared.hasDetailedRows) {
    return `${processed}/${total}`;
  }

  if (!parts.detailed) {
    return `${" ".repeat(prepared.countWidth)} ${" ".repeat(prepared.countWidth)} ${processed}/${total}`;
  }

  const succeeded = parts.succeeded.padStart(prepared.countWidth, " ");
  const failed = parts.failed.padStart(prepared.countWidth, " ");

  return (
    <>
      <Text color="green">{succeeded}</Text>
      <Text>{` `}</Text>
      <Text color="red">{failed}</Text>
      <Text>{` ${processed}/${total}`}</Text>
    </>
  );
};

const AmountCell = ({
  task,
  prepared,
}: {
  readonly task: TaskSnapshot;
  readonly prepared: AmountPrepared;
}) => (
  <Text wrap="truncate-end">
    <AmountValue task={task} prepared={prepared} />
  </Text>
);

export const amount = (): Column<unknown, AmountPrepared> => ({
  prepare: prepareAmount,
  align: "right",
  render: ({ task }, ctx) => <AmountCell task={task} prepared={ctx.prepared} />,
});
