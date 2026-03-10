import { minimumDescriptionWidth, type DescriptionCap } from "./description-column";
import type { ProgressPolicyMode } from "./progress-column";

interface RootLayoutPolicy {
  readonly descriptionCap: DescriptionCap;
  readonly progressMode?: ProgressPolicyMode;
  readonly showElapsed: boolean;
  readonly showEta: boolean;
}

interface ColumnMeasure {
  readonly id: "description" | "progress" | "elapsed" | "eta";
  readonly min: number;
  readonly preferred: number;
}

export const COLUMN_GAP = 1;

const visibleWidth = (widths: ReadonlyArray<number>, gap: number): number => {
  const visible = widths.filter((width) => width > 0);
  return visible.reduce((sum, width) => sum + width, 0) + Math.max(0, visible.length - 1) * gap;
};

const nextDistinctWidth = (
  entries: ReadonlyArray<{ readonly width: number }>,
  widest: number,
): number | undefined => entries.find((entry) => entry.width < widest)?.width;

const reduceOverflowRichStyle = (
  widths: Array<number>,
  minimums: ReadonlyArray<number>,
  targetWidth: number,
  gap: number,
): Array<number> => {
  let overflow = visibleWidth(widths, gap) - targetWidth;
  while (overflow > 0) {
    const shrinkable = widths
      .map((width, index) => ({
        width,
        index,
        minimum: minimums[index] ?? width,
      }))
      .filter(({ width, minimum }) => width > minimum)
      .sort((left, right) => right.width - left.width || left.index - right.index);

    if (shrinkable.length === 0) {
      break;
    }

    const widest = shrinkable[0]!.width;
    const cohort = shrinkable.filter(({ width }) => width === widest);
    const nextWidth = nextDistinctWidth(shrinkable, widest);
    const floor = Math.max(nextWidth ?? 0, ...cohort.map(({ minimum }) => minimum));
    const maxUniformDrop = widest - floor;
    const uniformDrop = Math.min(maxUniformDrop, Math.floor(overflow / cohort.length));

    if (uniformDrop > 0) {
      for (const { index } of cohort) {
        widths[index] = widths[index]! - uniformDrop;
      }
      overflow -= uniformDrop * cohort.length;
      continue;
    }

    let changed = false;
    for (const { index, minimum } of cohort) {
      if (overflow <= 0) {
        break;
      }

      if (widths[index]! <= minimum) {
        continue;
      }

      widths[index] = widths[index]! - 1;
      overflow -= 1;
      changed = true;
    }

    if (!changed) {
      break;
    }
  }

  return widths;
};

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

const rootLayoutCandidates = (options: {
  readonly hasProgress: boolean;
  readonly hasEta: boolean;
  readonly preferDroppingEtaBeforePercent?: boolean;
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
          ...(options.preferDroppingEtaBeforePercent
            ? [
                policy({
                  descriptionCap: "plain",
                  progressMode: "full",
                  showElapsed: true,
                  showEta: false,
                }),
              ]
            : []),
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
  readonly preferDroppingEtaBeforePercent?: boolean;
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
          COLUMN_GAP,
        );

  return new Map(measures.map((measure, index) => [measure.id, widths[index]!] as const));
};
