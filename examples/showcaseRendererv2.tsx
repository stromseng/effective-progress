import { Effect, Logger } from "effect";
import { Box, Text } from "ink";
import * as Progress from "../src";
import { isDeterminate } from "../src/ink-renderer/shared/determinate";
import {
  formatAmount,
  formatElapsed,
  getTaskIndicator,
  getSpinnerIndicator,
} from "../src/ink-renderer/shared/format";
import { DEFAULT_BAR_WIDTH, percentText } from "../src/ink-renderer/shared/progress";
import { textWidth } from "../src/ink-renderer/shared/text-width";
import { InkRenderer } from "../src/services/ink-renderer";
import { createRendererv2InkRenderer } from "../src/rendererv2/ink-renderer.sketch";
import type {
  ProgressColumnDefinition,
  ProgressColumnMeasurement,
  ProgressColumnProps,
} from "../src/rendererv2/public-api.sketch";

const randomMillis = (base: number, jitter: number) =>
  Math.max(80, Math.round(base + (Math.random() * 2 - 1) * jitter));

const sleepRandom = (base: number, jitter: number) =>
  Effect.sleep(`${randomMillis(base, jitter)} millis`);

const stages = ["fetch", "transform", "persist"] as const;
const services = ["identity", "catalog"] as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const createDescriptionColumn = (config: {
  readonly minWidth: number;
  readonly paddingRight: number;
  readonly sticky: boolean;
  readonly stickyMaxWidth?: number;
}): ProgressColumnDefinition => {
  const Component = ({ row, width }: ProgressColumnProps) => {
    const showTree = width >= row.derived.treePrefixWidth + 6;
    const content = showTree
      ? `${row.derived.treePrefix}${row.task.description}`
      : row.task.description;

    return <Text wrap="truncate-end">{content}</Text>;
  };

  return {
    Component,
    measure: (rows: ReadonlyArray<ProgressColumnProps["row"]>): ProgressColumnMeasurement => ({
      minWidth: config.minWidth,
      preferredWidth: rows.reduce(
        (max, row) => Math.max(max, row.derived.treePrefixedDescriptionWidth),
        config.minWidth,
      ),
      maxWidth: undefined,
    }),
    paddingRight: config.paddingRight,
    noWrap: false,
    sticky: config.sticky,
    stickyMaxWidth: config.stickyMaxWidth,
  };
};

const createStatusColumn = (config: {
  readonly width: number;
  readonly paddingRight: number;
}): ProgressColumnDefinition => {
  const Component = ({ row, tick }: ProgressColumnProps) => {
    const indicator =
      row.task.status === "running"
        ? getSpinnerIndicator(tick)
        : getTaskIndicator(row.task, tick);

    return <Text color={indicator.color}>{indicator.symbol}</Text>;
  };

  return {
    Component,
    measure: () => ({
      minWidth: config.width,
      preferredWidth: config.width,
      maxWidth: config.width,
    }),
    fixedWidth: config.width,
    paddingRight: config.paddingRight,
    noWrap: true,
  };
};

const progressAmountWidth = (rows: ReadonlyArray<ProgressColumnProps["row"]>): number =>
  rows.reduce((max, row) => Math.max(max, textWidth(formatAmount(row.task, 0))), 1);

const renderProgressBar = (task: ProgressColumnProps["row"]["task"], width: number) => {
  if (!isDeterminate(task)) {
    return " ".repeat(Math.max(0, width));
  }

  const total = Math.max(task.units.total, task.units.processed);
  if (total <= 0) {
    return "━".repeat(Math.max(0, width));
  }

  const completed = clamp(Math.round((task.units.processed / total) * width), 0, width);
  const remaining = Math.max(0, width - completed);

  return `${"━".repeat(completed)}${"─".repeat(remaining)}`;
};

const createProgressColumn = (config: {
  readonly minWidth: number;
  readonly barWidth: number;
  readonly paddingRight: number;
  readonly sticky: boolean;
}): ProgressColumnDefinition => {
  const Component = ({ row, width }: ProgressColumnProps) => {
    const amount = formatAmount(row.task, 0);
    const percent = percentText(row.task);

    if (width < 5) {
      return <Text wrap="truncate-end">{percent}</Text>;
    }

    if (!row.derived.isDeterminate || width < textWidth(amount) + 6) {
      return <Text wrap="truncate-end">{width >= textWidth(amount) ? amount : percent}</Text>;
    }

    const amountWidth = Math.min(textWidth(amount), Math.max(1, width - 5));
    const barWidth = Math.max(4, width - amountWidth - 1);

    if (barWidth + 1 + amountWidth > width) {
      return <Text wrap="truncate-end">{amount}</Text>;
    }

    return (
      <Box width={width}>
        <Text wrap="truncate-end">{renderProgressBar(row.task, barWidth)}</Text>
        <Text>{` `}</Text>
        <Text wrap="truncate-end">{amount}</Text>
      </Box>
    );
  };

  return {
    Component,
    measure: (rows: ReadonlyArray<ProgressColumnProps["row"]>): ProgressColumnMeasurement => {
      const amountWidth = progressAmountWidth(rows);
      const percentWidth = rows.reduce(
        (max, row) => Math.max(max, textWidth(percentText(row.task))),
        3,
      );
      const hasDeterminateRows = rows.some((row) => row.derived.isDeterminate);
      const preferredWidth = hasDeterminateRows
        ? Math.max(percentWidth, amountWidth + 1 + config.barWidth)
        : Math.max(percentWidth, amountWidth);

      return {
        minWidth: Math.min(percentWidth, config.minWidth),
        preferredWidth,
        maxWidth: preferredWidth,
      };
    },
    paddingRight: config.paddingRight,
    noWrap: false,
    sticky: config.sticky,
  };
};

const createElapsedColumn = (config: {
  readonly minWidth: number;
  readonly justify: "left" | "right";
  readonly sticky: boolean;
}): ProgressColumnDefinition => {
  const Component = ({ row, now, width }: ProgressColumnProps) => (
    <Text wrap="truncate-end" color="gray">
      {formatElapsed(row.task, now).slice(0, Math.max(0, width))}
    </Text>
  );

  return {
    Component,
    measure: (rows: ReadonlyArray<ProgressColumnProps["row"]>): ProgressColumnMeasurement => ({
      minWidth: config.minWidth,
      preferredWidth: rows.reduce(
        (max, row) => Math.max(max, textWidth(formatElapsed(row.task, Date.now()))),
        config.minWidth,
      ),
      maxWidth: rows.reduce(
        (max, row) => Math.max(max, textWidth(formatElapsed(row.task, Date.now()))),
        config.minWidth,
      ),
    }),
    justify: config.justify,
    noWrap: true,
    sticky: config.sticky,
  };
};

const columns: ReadonlyArray<ProgressColumnDefinition> = [
  createDescriptionColumn({
    minWidth: 1,
    paddingRight: 2,
    sticky: true,
  }),
  createStatusColumn({
    width: 1,
    paddingRight: 2,
  }),
  createProgressColumn({
    minWidth: 4,
    barWidth: DEFAULT_BAR_WIDTH,
    paddingRight: 2,
    sticky: true,
  }),
  createElapsedColumn({
    minWidth: 2,
    justify: "right",
    sticky: true,
  }),
];

const serviceFlow = (service: string, serviceIndex: number) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`${service}: pipeline started`);

    yield* Progress.forEach([service], () => sleepRandom(1400, 450), {
      description: `${service}: waiting for upstream`,
      transient: true,
    });

    yield* Progress.all(
      Array.from({ length: 3 }, (_, batchIndex) =>
        Effect.gen(function* () {
          const batch = batchIndex + 1;

          yield* Progress.forEach(stages, () => sleepRandom(950, 280), {
            description: `${service}: batch ${batch} stages`,
          });

          yield* Progress.forEach(
            ["probe"],
            () =>
              Effect.gen(function* () {
                yield* sleepRandom(1600, 500);
                if (serviceIndex === 0 && batch === 2) {
                  yield* Effect.logWarning("One consistency probe was slower than expected");
                }
              }),
            {
              description: `${service} probe`,
              transient: true,
            },
          );
        }),
      ),
      {
        description: `${service}: processing batches`,
        concurrency: 2,
      },
    );

    yield* Effect.logInfo(`${service}: pipeline finished`);
    yield* Effect.logInfo(`${service}: complete`);
  });

const program = Effect.gen(function* () {
  yield* Effect.logInfo("Showcase: nested concurrent tasks with spinners and mixed logging.");

  yield* Progress.all(
    services.map((service, index) => serviceFlow(service, index)),
    {
      description: "Orchestrating service rollout",
      concurrency: 2,
    },
  );

  yield* Progress.forEach(
    ["publish changelog", "snapshot metrics", "emit webhook"],
    (step, index) =>
      Effect.gen(function* () {
        yield* sleepRandom(1100, 300);
        if (index === 2) {
          yield* Effect.logInfo("Webhook dispatch queued for async confirmation");
          yield* Effect.logInfo(`Post-step complete: ${step}`);
        }
      }),
    {
      description: "Finalization",
      concurrency: 2,
    },
  );
}).pipe(Progress.task({ description: "Showcase program", transient: false }));

const renderer = createRendererv2InkRenderer(columns);

Effect.runPromise(
  program.pipe(Effect.provideService(InkRenderer, renderer), Effect.provide(Logger.pretty)),
);
