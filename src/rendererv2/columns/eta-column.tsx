import { Box, Text } from "ink";
import { useNow } from "../../ink-renderer/now-context";
import { formatEta } from "../../ink-renderer/shared/format";
import { textWidth } from "../../ink-renderer/shared/text-width";
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

  let cropped = "";
  for (const char of text) {
    if (textWidth(cropped + char) > width) {
      break;
    }
    cropped += char;
  }

  return cropped;
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
  if (width >= textWidth(prefixed)) {
    return { mode: "prefixed", text: prefixed };
  }

  if (width >= textWidth(duration)) {
    return { mode: "duration", text: duration };
  }

  return {
    mode: "compact",
    text: cropTextToWidth(primaryUnit(duration), width),
  };
};

export interface EtaColumnConfig {
  readonly minWidth: number;
  readonly justify: "left" | "right";
  readonly sticky: boolean;
}
export const defaultEtaColumnConfig = {
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

        return Math.max(max, textWidth(`ETA: ${duration}`));
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

        return Math.max(max, textWidth(`ETA: ${duration}`));
      }, 0),
    justify: resolvedConfig.justify,
    noWrap: true,
    sticky: resolvedConfig.sticky,
  };
};
