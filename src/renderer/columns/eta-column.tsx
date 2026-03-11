import { Box, Text } from "ink";
import { useNow } from "../context/now-context";
import { formatEta } from "../shared/format";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../public-api";

const primaryUnit = (duration: string): string => duration.split(" ")[0] ?? duration;

const cropTextToWidth = (text: string, width: number): string => {
  if (width <= 0) {
    return "";
  }

  return text.slice(0, width);
};

const etaDurationText = (row: ProgressColumnProps["row"], now: number): string | undefined => {
  const eta = formatEta(row.task, now);
  return eta === "" ? undefined : eta;
};

type EtaRender =
  | { readonly mode: "prefixed"; readonly text: string }
  | { readonly mode: "duration"; readonly text: string }
  | { readonly mode: "compact"; readonly text: string };

const renderEtaText = (row: ProgressColumnProps["row"], now: number, width: number): EtaRender => {
  const duration = etaDurationText(row, now);
  if (duration === undefined) {
    return { mode: "compact", text: "" };
  }

  const prefixed = `ETA: ${duration}`;
  if (width >= prefixed.length) {
    return { mode: "prefixed", text: prefixed };
  }

  if (width >= duration.length) {
    return { mode: "duration", text: duration };
  }

  return {
    mode: "compact",
    text: cropTextToWidth(primaryUnit(duration), width),
  };
};

interface EtaColumnConfig {
  readonly minWidth: number;
  readonly justify: "left" | "right";
  readonly sticky: boolean;
}
const defaultEtaColumnConfig = {
  minWidth: 3,
  justify: "right",
  sticky: true,
} satisfies EtaColumnConfig;

const EtaText = ({
  row,
  width,
  justify,
}: Pick<ProgressColumnProps, "row" | "width"> & {
  readonly justify: EtaColumnConfig["justify"];
}) => {
  const now = useNow();
  const rendered = renderEtaText(row, now, width);
  const justifyContent =
    rendered.mode === "prefixed" ? (justify === "right" ? "flex-end" : "flex-start") : "flex-start";

  return (
    <Box width={width} justifyContent={justifyContent}>
      <Text wrap="truncate-end" color="gray">
        {rendered.text}
      </Text>
    </Box>
  );
};

export const createEtaColumn = (config?: Partial<EtaColumnConfig>): ProgressColumnDefinition => {
  const resolvedConfig = {
    ...defaultEtaColumnConfig,
    ...config,
  } satisfies EtaColumnConfig;
  const Component = ({ row, width }: ProgressColumnProps) => (
    <EtaText row={row} width={width} justify={resolvedConfig.justify} />
  );

  return {
    Component,
    measure: ({ rows, now }): ProgressColumnMeasurement => {
      const width = rows.reduce((max, row) => {
        const duration = etaDurationText(row, now);
        if (duration === undefined) {
          return max;
        }

        return Math.max(max, `ETA: ${duration}`.length);
      }, resolvedConfig.minWidth);

      return {
        minWidth: resolvedConfig.minWidth,
        preferredWidth: width,
        maxWidth: width,
      };
    },
    getLayoutDependency: ({ rows, now }) =>
      rows.reduce((max, row) => {
        const duration = etaDurationText(row, now);
        if (duration === undefined) {
          return max;
        }

        return Math.max(max, `ETA: ${duration}`.length);
      }, 0),
    justify: resolvedConfig.justify,
    noWrap: true,
    sticky: resolvedConfig.sticky,
  };
};
