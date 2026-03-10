import {
  COLUMN_GAP,
  minimumDescriptionWidth,
  reduceOverflowRichStyle,
  type ColumnMeasure,
  type RootLayoutPolicy,
  visibleWidth,
} from "./shared";

const policy = (value: RootLayoutPolicy): RootLayoutPolicy => value;

export const rootLayoutMeasures = (
  policy: RootLayoutPolicy,
  options: {
    readonly descriptionPreferredWidth: number;
    readonly descriptionTreeMinWidth: number;
    readonly elapsedMinWidth: number;
    readonly elapsedPreferredWidth: number;
    readonly etaMinWidth: number;
    readonly etaPreferredWidth: number;
    readonly percentWidth: number;
    readonly progressPreferredWidth: number;
    readonly progressFullMinWidth: number;
    readonly hasProgress: boolean;
    readonly hasEta: boolean;
  },
): Array<ColumnMeasure> => [
  {
    id: "description",
    min:
      policy.descriptionCap === "tree"
        ? options.descriptionTreeMinWidth
        : minimumDescriptionWidth(policy.descriptionCap),
    preferred: options.descriptionPreferredWidth,
  },
  ...(options.hasProgress && policy.progressMode !== undefined
    ? [
        {
          id: "progress" as const,
          min: policy.progressMode === "full" ? options.progressFullMinWidth : options.percentWidth,
          preferred:
            policy.progressMode === "full" ? options.progressPreferredWidth : options.percentWidth,
        },
      ]
    : []),
  ...(policy.showElapsed
    ? [
        {
          id: "elapsed" as const,
          min: options.elapsedMinWidth,
          preferred: options.elapsedPreferredWidth,
        },
      ]
    : []),
  ...(policy.showEta && options.hasEta
    ? [
        {
          id: "eta" as const,
          min: options.etaMinWidth,
          preferred: options.etaPreferredWidth,
        },
      ]
    : []),
];

const rootLayoutWidth = (
  policy: RootLayoutPolicy,
  options: Parameters<typeof rootLayoutMeasures>[1],
): number =>
  visibleWidth(
    rootLayoutMeasures(policy, options).map((column) => column.min),
    COLUMN_GAP,
  );

export const rootLayoutCandidates = (options: {
  readonly hasProgress: boolean;
  readonly hasEta: boolean;
}): Array<RootLayoutPolicy> => {
  if (!options.hasProgress) {
    return [
      policy({ descriptionCap: "tree", showElapsed: true, showEta: false }),
      policy({ descriptionCap: "plain", showElapsed: true, showEta: false }),
      policy({ descriptionCap: "plain", showElapsed: false, showEta: false }),
      policy({ descriptionCap: "compact", showElapsed: false, showEta: false }),
      policy({ descriptionCap: "spinner", showElapsed: false, showEta: false }),
    ];
  }

  return [
    ...(options.hasEta
      ? [
          policy({ descriptionCap: "tree", progressMode: "full", showElapsed: true, showEta: true }),
          policy({ descriptionCap: "plain", progressMode: "full", showElapsed: true, showEta: true }),
          policy({ descriptionCap: "plain", progressMode: "percent", showElapsed: true, showEta: true }),
        ]
      : []),
    ...(options.hasEta
      ? []
      : [
          policy({ descriptionCap: "tree", progressMode: "full", showElapsed: true, showEta: false }),
          policy({ descriptionCap: "plain", progressMode: "full", showElapsed: true, showEta: false }),
        ]),
    policy({ descriptionCap: "plain", progressMode: "percent", showElapsed: true, showEta: false }),
    policy({ descriptionCap: "plain", progressMode: "percent", showElapsed: false, showEta: false }),
    policy({ descriptionCap: "compact", progressMode: "percent", showElapsed: false, showEta: false }),
    policy({ descriptionCap: "compact", showElapsed: false, showEta: false }),
    policy({ descriptionCap: "spinner", showElapsed: false, showEta: false }),
  ];
};

export const selectRootLayoutPolicy = (options: {
  readonly terminalColumns: number | undefined;
  readonly hasProgress: boolean;
  readonly hasEta: boolean;
  readonly descriptionPreferredWidth: number;
  readonly descriptionTreeMinWidth: number;
  readonly elapsedMinWidth: number;
  readonly elapsedPreferredWidth: number;
  readonly etaMinWidth: number;
  readonly etaPreferredWidth: number;
  readonly percentWidth: number;
  readonly progressPreferredWidth: number;
  readonly progressFullMinWidth: number;
}): RootLayoutPolicy => {
  const candidates = rootLayoutCandidates(options);
  if (options.terminalColumns === undefined) {
    return candidates[0]!;
  }

  return (
    candidates.find((policy) => rootLayoutWidth(policy, options) <= options.terminalColumns!) ??
    candidates.at(-1) ??
    { descriptionCap: "spinner", showElapsed: false, showEta: false }
  );
};

export const assignedWidthsForMeasures = (
  measures: ReadonlyArray<ColumnMeasure>,
  targetWidth: number | undefined,
): Map<ColumnMeasure["id"], number> => {
  const preferredWidths = measures.map((measure) => Math.max(measure.min, measure.preferred));
  const widths =
    targetWidth === undefined || visibleWidth(preferredWidths, COLUMN_GAP) <= targetWidth
      ? preferredWidths
      : reduceOverflowRichStyle(
          [...preferredWidths],
          measures.map((measure) => measure.min),
          targetWidth,
        );

  return new Map(measures.map((measure, index) => [measure.id, widths[index]!] as const));
};
