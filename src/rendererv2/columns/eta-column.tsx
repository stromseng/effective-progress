import { Text } from "ink";
import { useNow } from "../../ink-renderer/now-context";
import { formatEta } from "../../ink-renderer/shared/format";
import { textWidth } from "../../ink-renderer/shared/text-width";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api";

const RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR = textWidth("ETA: 59m 59s");

const primaryUnit = (duration: string): string => duration.split(" ")[0] ?? duration;

const etaDurationText = (row: ProgressColumnProps["row"], now: number): string | undefined => {
  const eta = formatEta(row.task, now);
  return eta === "" ? undefined : eta;
};

const renderEtaText = (row: ProgressColumnProps["row"], now: number, width: number): string => {
  const duration = etaDurationText(row, now);
  if (duration === undefined) {
    return "";
  }

  const prefixed = `ETA: ${duration}`;
  if (width >= textWidth(prefixed)) {
    return prefixed;
  }

  if (width >= textWidth(duration)) {
    return duration;
  }

  return primaryUnit(duration);
};

export interface EtaColumnConfig {
  readonly minWidth: number;
  readonly justify: "left" | "right";
  readonly paddingRight: number;
  readonly sticky: boolean;
}

const EtaText = ({ row, width }: Pick<ProgressColumnProps, "row" | "width">) => {
  const now = useNow();

  return (
    <Text wrap="truncate-end" color="gray">
      {renderEtaText(row, now, width)}
    </Text>
  );
};

export const createEtaColumn = (config: EtaColumnConfig): ProgressColumnDefinition => {
  const Component = ({ row, width }: ProgressColumnProps) => <EtaText row={row} width={width} />;

  return {
    Component,
    measure: ({ rows, now }): ProgressColumnMeasurement => ({
      minWidth: config.minWidth,
      preferredWidth: rows.reduce((max, row) => {
        const duration = etaDurationText(row, now);
        if (duration === undefined) {
          return max;
        }

        return Math.max(max, textWidth(`ETA: ${duration}`), RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR);
      }, config.minWidth),
      maxWidth: rows.reduce((max, row) => {
        const duration = etaDurationText(row, now);
        if (duration === undefined) {
          return max;
        }

        return Math.max(max, textWidth(`ETA: ${duration}`), RESERVED_ETA_WIDTH_UP_TO_ONE_HOUR);
      }, config.minWidth),
    }),
    justify: config.justify,
    noWrap: true,
    paddingRight: config.paddingRight,
    sticky: config.sticky,
  };
};
