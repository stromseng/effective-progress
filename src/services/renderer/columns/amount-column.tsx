import { Text } from "ink";
import { memo } from "react";
import type { CellInfo, TaskSnapshot } from "../../../types";
import { getAmountParts } from "../shared/amount-parts";
import { textWidth } from "../shared/text-width";

export interface AmountLayout {
  readonly hasDetailedRows: boolean;
  readonly countWidth: number;
  readonly processedWidth: number;
  readonly totalWidth: number;
  readonly preferredWidth: number;
}

export const measureAmountLayout = (rows: ReadonlyArray<CellInfo<unknown>>): AmountLayout => {
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
  layout,
}: {
  readonly task: TaskSnapshot;
  readonly layout: AmountLayout;
}) => {
  const parts = getAmountParts(task);
  if (parts.kind === "indicator") {
    return parts.text;
  }

  const processed = parts.processed.padStart(layout.processedWidth, " ");
  const total = parts.total.padStart(layout.totalWidth, " ");

  if (!layout.hasDetailedRows) {
    return `${processed}/${total}`;
  }

  if (!parts.detailed) {
    return `${" ".repeat(layout.countWidth)} ${" ".repeat(layout.countWidth)} ${processed}/${total}`;
  }

  const succeeded = parts.succeeded.padStart(layout.countWidth, " ");
  const failed = parts.failed.padStart(layout.countWidth, " ");

  return (
    <>
      <Text color="green">{succeeded}</Text>
      <Text>{` `}</Text>
      <Text color="red">{failed}</Text>
      <Text>{` ${processed}/${total}`}</Text>
    </>
  );
};

export const AmountCell = memo(
  ({ task, ...layout }: { readonly task: TaskSnapshot } & AmountLayout) => (
    <Text wrap="truncate-end">
      <AmountValue task={task} layout={layout} />
    </Text>
  ),
);
