# effective-progress

[![npm version](https://img.shields.io/npm/v/effective-progress)](https://www.npmjs.com/package/effective-progress)

> [!WARNING]
> Pre-`1.0.0`, breaking changes may happen in any minor release. SemVer guarantees will begin at `1.0.0`.  
> I recommend using only the `Progress.all` and `Progress.forEach` APIs for now, as they will likely change the least. The lower-level APIs for manual progress bar control are more likely to see breaking changes as I iterate on the design.
>
> I am currently waiting on https://github.com/anomalyco/opentui/issues/204 to swap the renderer to opentui.
>
> Please open an issue or reach out if you have any questions or want to contribute!
> Feedback and contributions are very welcome!

<img alt="Showcase output" src="docs/images/showcase.gif" width="600" />

`effective-progress` is an [Effect](https://effect.website/)-native CLI progress bar library with:

- multiple nested tree-like progress bars
- spinner support for “we have no idea how long this takes” work
- keep using Effect v4 `Effect.log*` / `Logger` and `Console.log` while progress rendering is active
- familiar `.all` and `.forEach` APIs — swap `Effect` for `Progress`, get progress bars basically for free
- flicker-free rendering with [Ink](https://github.com/vadimdemedes/ink)

## Install

```bash
bun add effective-progress effect@^4.0.0-beta.100
```

## Usage

Iterate items with a single progress bar.

```ts
import { Effect } from "effect";
import * as Progress from "effective-progress";

const program = Progress.all(
  Array.from({ length: 5 }).map((_, i) =>
    Effect.gen(function* () {
      yield* Effect.sleep("1 second");
      yield* Effect.logInfo(`Completed task ${i + 1}`);
    }),
  ),
  { description: "Running tasks in parallel", concurrency: 2 },
);

Effect.runPromise(program);
```

<img alt="Basic example output" src="docs/images/basic.gif" width="600" />

### Nested example

Nested progress bars with tree-style rendering that highlights parent tasks and their subtasks

```ts
import { Effect } from "effect";
import * as Progress from "effective-progress";

const program = Progress.all(
  Array.from({ length: 5 }).map((_, i) =>
    Effect.asVoid(
      Progress.all(
        Array.from({ length: 15 }).map((_) => Effect.sleep("100 millis")),
        { description: `Running subtasks for task ${i + 1}` },
      ),
    ),
  ),
  { description: "Running tasks in parallel", concurrency: 2 },
);

Effect.runPromise(program);
```

<img alt="Nested example output" src="docs/images/nesting.gif" width="600" />

### Effect.all result mode

`Progress.all` mirrors Effect v4's fail-fast default and `mode: "result"`, rendering the amount of successes and failures as work completes.

<img alt="Mixed outcomes modes output" src="docs/images/mixedOutcomes.gif" width="600" />

- `Progress.all` in default mode (`mode: "default"`) remains fail-fast.
- In fail-fast runs, unresolved units remain unprocessed.
- `mode: "result"` runs every effect and returns a `Result` for each outcome while keeping mixed outcomes in the task counters.
- Result-mode tasks finalize as `done` when all units are accounted for.
- Empty collections are valid inputs for `Progress.all` / `Progress.forEach` and render as `0/0` instead of failing.

### Single task with a typed handle

Use `Progress.task(...)` when you want one progress bar around a custom effect. The callback form gives you a task-local handle, so you can update counts, descriptions, and metadata without fetching the current task ID first.

```ts
import { Effect } from "effect";
import * as Progress from "effective-progress";

const program = Progress.task(
  (task) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Starting deployment");
      yield* task.incrementSucceeded();
      yield* task.update({
        description: "Uploading release bundle",
      });
      yield* Effect.sleep("1 second");
      yield* task.incrementSucceeded(2);
    }),
  {
    description: "Deploy release",
    total: 3,
  },
);

Effect.runPromise(program);
```

- The plain `Progress.task(effect, options)` form auto-finalizes from the effect exit.
- The callback form also auto-finalizes from the callback exit unless you explicitly `yield* task.complete` or `yield* task.fail` first.
- `yield* Progress.Task` exposes the current task ID when you need it.

### Other examples

- `examples/simpleExample.ts` - low-boilerplate real-world flow
- `examples/advancedExample.ts` - mixed high-level and low-level Progress service usage
- `examples/basic.ts` - minimal `Progress.all` usage
- `examples/nesting.ts` - nested tree rendering with parent and child tasks
- `examples/mixedOutcomes.ts` - fail-fast vs `result` mode with mixed success/failure counters
- `examples/cliProgressSemantics.ts` - zero totals, negative totals clearing to unknown totals, overflow counts, and empty `all` / `forEach`
- `examples/unknownTotalCounting.ts` - count successes/failures without a known total and render `processed/?`
- `examples/typedMetadata.ts` - typed task metadata rendered through custom columns
- `examples/mixedNestedColumns.ts` - different column sets aligned across mixed task types
- `examples/showcase.ts` - nested concurrent tasks, spinner workloads, and mixed Effect/Console logging
- `examples/performance.ts` - stress-style run with high log volume and deeply nested progress updates
- `examples/performanceLong.ts` - longer-running stress run with roughly 10x the work of `performance.ts`
- `examples/performanceComparison.ts` - bare vs progress comparison for the `performance.ts` workload
- `examples/performanceComparisonLong.ts` - longer bare vs progress comparison for the `performanceLong.ts` workload

## Configuration

### Logging behavior

- The Ink renderer runs with `patchConsole: true`, so console output is patched by Ink while the app is mounted.
- `Effect.log*` uses the active Effect v4 `Logger` set, including custom loggers installed with `Logger.layer(...)`.
- The low-level `progress.log(...)` method emits through `Effect.log`, so it honors the current log level, logger set, annotations, and spans.
- Direct `Console` calls still use the currently provided Effect `Console` reference.
- Formatting and routing remain controlled by the consumer's logger and console configuration.

For example, install the v4 pretty console logger around a program with:

```ts
import { Effect, Logger } from "effect";

Effect.runPromise(program.pipe(Effect.provide(Logger.layer([Logger.consolePretty()]))));
```

### Ink renderer behavior

- Rendering is powered by [Ink](https://github.com/vadimdemedes/ink).
- Built-in columns are exposed as `Progress.Columns.description()`, `bar()`, `amount()`, `elapsedEta()`, `elapsed()`, `eta()`, `spacer()`, and `defaults()`.
- `elapsedEta()` renders a compact clock-style column as `elapsed<eta` using the shape `00:00<00:00`; `defaults()` now uses that combined column.
- Determinate bars are segmented by outcome: succeeded (green), failed (red), and remaining (neutral).
- `bar()` defaults to a fixed width of `30`; pass `bar({ size: "fullwidth" })` to consume remaining row width or `bar({ size: 12 })` for an explicit width.
- Determinate amount text shows counters without prefixes: `<succeeded> <failed> <processed>/<total>`.
- Counts can exceed `total`; the amount text keeps those raw values (for example `12/10`) while the bar stays visually clamped at full.
- `total: 0` is valid for determinate tasks and renders as a full bar by default.
- Column widths are resolved per visual column index, so rows with different column definitions can still align with each other.
- Column `prepare(...)` functions can compute shared layout data once for all rows using the same column definition at a given index.
- On narrow terminals, layout compacts to fit available width and tree prefixes are suppressed when description space is too tight.

## Task API

`Progress.task(...)` supports two styles:

- `Progress.task(effect, options)` for the simple "wrap this effect in a task" case.
- `Progress.task((task) => effect, options)` when you want a typed handle for task-local control.

The handle exposes:

- `incrementSucceeded(amount?)`
- `incrementFailed(amount?)`
- `update({ description, total, countDisplay, transient, succeeded, failed })`
- `getMetadata`, `setMetadata`, `updateMetadata`
- `getSnapshot`
- `complete`
- `fail`

When you need lower-level control, the `Progress` service is available inside the effect and exposes APIs like `addTask`, `updateTask`, `incrementSucceeded(taskId, amount)`, and `completeTask(taskId)`.

The primary v4-style service layers are exposed as `Progress.layer` and `ProgressStdio.layer`.

Example using the lower-level service API:

```ts
import { Effect } from "effect";
import * as Progress from "effective-progress";

const program = Progress.task(
  Effect.gen(function* () {
    const progress = yield* Progress.Progress;
    const currentTask = yield* Progress.Task;
    yield* Effect.logInfo("Updating the current task", { taskId: currentTask });

    // Manual determinate updates:
    yield* progress.incrementSucceeded(currentTask, 3);
    yield* progress.incrementFailed(currentTask, 1);
    yield* Effect.sleep("1 second");
  }),
  { description: "Manual task", total: 10 },
);
```

Manual total behavior:

- negative totals on task creation clear the total and switch to indeterminate rendering
- negative totals on later `updateTask` calls also clear the total
- explicit `total: undefined` on `updateTask` clears the total and switches back to indeterminate rendering

## Typed metadata and custom columns

Tasks can carry typed metadata, and that metadata type flows into custom column renderers.

```ts
import { Effect } from "effect";
import * as Progress from "effective-progress";

interface EvalMeta {
  readonly model: string;
  readonly score: number;
}

const scoreColumn = (): Progress.ColumnDef<EvalMeta> => ({
  align: "right",
  flexShrink: 0,
  minWidth: 5,
  render: ({ task }) => `${task.metadata.score}%`,
});

const program = Progress.task(
  (task) =>
    Effect.gen(function* () {
      yield* task.setMetadata({ model: "gpt-5.4", score: 91 });
      yield* task.incrementSucceeded();
    }),
  {
    description: "Run evaluation",
    total: 1,
    metadata: { model: "gpt-5.4", score: 0 },
    columns: [
      Progress.Columns.description(),
      Progress.Columns.bar(),
      {
        flexShrink: 0,
        minWidth: 10,
        render: ({ task }) => task.metadata.model,
      },
      scoreColumn(),
      Progress.Columns.elapsed(),
    ],
  },
);
```

`ColumnDef<M, P>` supports:

- `prepare(rows)` to derive shared data for all matching rows at that column index
- `render(cell, ctx)` to render the cell
- sizing hints with `flexGrow`, `flexShrink`, `flexBasis`, and `minWidth`
- `align` with `"left"`, `"center"`, or `"right"`

If a task does not provide `columns`, the renderer falls back to `Progress.Columns.defaults()`.

## Performance benchmarks

Run `bun run bench` for isolated store-update and column-resolution measurements.
Each fixture uses three warmup rounds and nine measured rounds, reporting JSON with
raw samples, median/min/max time, throughput, and runtime information. Task setup,
correctness assertions, explicit flushes, and console output are outside the timed sections;
the benchmark does not render a terminal UI or add sleeps.

The store cases update one hot task in stores of 1, 100, and 1,000 tasks. Column cases
resolve 100 and 1,000 rows using defaults or distinct custom prepare functions. Every
round checks final counters or prepared/layout output and exits with an error on a mismatch.

To compare a change, run the same benchmark on both revisions with the same Bun
version and machine, without other CPU-heavy work. Alternate revision order across
multiple runs and compare medians and sample spread. These microbenchmarks measure
store/resolver work; use the existing `perf` script and performance examples separately
to investigate Ink rendering, logging, and end-to-end overhead.

## Effect compatibility

This release targets Effect `4.0.0-beta.100` or newer compatible v4 prereleases. Effect v4 is still in beta, so its APIs may change between beta releases.
