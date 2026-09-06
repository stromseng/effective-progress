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
bun add effective-progress effect@^4.0.0-rc.112
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

### Examples

Run these from the repository root, starting with `bun examples/single-task.ts`:

| Order | Example                                      | What it demonstrates                                 |
| ----- | -------------------------------------------- | ---------------------------------------------------- |
| 1     | [Single task](examples/single-task.ts)       | A spinner around one effect and automatic completion |
| 2     | [Collections](examples/basic.ts)             | `Progress.all`, concurrency, and logging             |
| 3     | [Nesting](examples/nesting.ts)               | Parent tasks and nested progress rows                |
| 4     | [Mixed outcomes](examples/mixed-outcomes.ts) | Fail-fast and result-mode counters                   |
| 5     | [Custom columns](examples/custom-columns.ts) | Typed metadata and column rendering                  |

The [example catalog](examples/README.md) also covers complete workflows, manual task
control, unknown totals, and other edge cases. Performance measurements and profiling
workloads live in [benchmarks/](benchmarks/README.md).

## Configuration

### Logging behavior

- The Ink renderer runs with `patchConsole: true`, so console output is patched by Ink while the app is mounted.
- `Effect.log*` uses the active Effect v4 `Logger` set, including custom loggers installed with `Logger.layer(...)`.
- Use `Effect.log(...)` or `Effect.logInfo(...)` directly; these honor the current log level, logger set, annotations, and spans.
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
- `update({ description, total, countDisplay, succeeded, failed })`
- `getMetadata`, `setMetadata`, `updateMetadata`
- `getSnapshot`
- `complete`
- `fail`

Handle reads return `Effect<Option<...>>`: `getMetadata` yields `Option<M>` and
`getSnapshot` yields `Option<TaskSnapshot>`. Removing a transient task (or its parent)
makes both reads return `None`. A retained task with `undefined` metadata returns
`Some(undefined)`. Handle writes to removed tasks are no-ops, and `updateMetadata`
does not invoke its callback for a removed task.

```ts
const metadata = yield * handle.getMetadata;
if (Option.isSome(metadata)) {
  // metadata.value has the metadata type inferred when the task was created.
}
```

Task mutation rules:

- Completion and failure make later task API writes no-ops, including counter,
  field, and metadata updates. Metadata update callbacks are not invoked. Retained
  tasks remain readable through `Some`; metadata objects are not deep-frozen.
- Counter values stay finite and nonnegative. Non-finite counter inputs preserve
  the previous value; if the resulting succeeded-plus-failed sum would overflow to
  infinity, both counter changes are ignored. Finite counts may still exceed the
  total, and negative finite values are clamped to zero.
- Totals retain their existing rules: negative or non-finite totals become unknown.
- A missing or removed parent ID creates a root task with `parentId: null`, without
  inheriting policies from the absent parent.

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

Task cleanup policy is fixed at creation. Pass `transient: true` when creating a task to remove its subtree when it finishes. Children inherit a transient parent’s cleanup policy, and a child can opt into transient cleanup under a persistent parent. `updateTask` and `TaskHandle.update` no longer accept `transient`.

Manual total behavior:

- negative or non-finite totals (`NaN`, `Infinity`, `-Infinity`) on task creation clear the total and switch to indeterminate rendering
- negative or non-finite totals on later `updateTask` calls also clear the total
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

Use `ColumnDef<M, P>` to author a column with typed metadata and prepared data, and
`Column<M>` for a list containing columns with different prepared types. The renderer
binds each prepared value to its definition before rendering cells.

If a task does not provide `columns`, the renderer falls back to `Progress.Columns.defaults()`.

### Clock hooks for custom cells

`render(cell, ctx)` receives `width` and `prepared`. For animated or timed output,
return a React component that calls `useSpinnerTick()` or `useNow()`. Hooks belong
inside the component, not directly inside the column's render callback.

```tsx
import { Text } from "ink";
import { useNow, type ColumnDef, type TaskSnapshot } from "effective-progress";

const AgeCell = ({ task }: { readonly task: TaskSnapshot }) => {
  const now = useNow(task.status === "running");
  const seconds = Math.floor(((task.completedAt ?? now) - task.startedAt) / 1_000);
  return <Text>{`${seconds}s`}</Text>;
};

const ageColumn: ColumnDef = {
  render: ({ task }) => <AgeCell task={task} />,
};
```

`useNow` follows the shared one-second clock; `useSpinnerTick` follows the shared
spinner clock. Both accept an optional `active` boolean (default `true`). Passing
`false` returns `0` without subscribing. Built-in cells unsubscribe when their task
finishes. These hooks consume the progress renderer's providers; they do not create
per-cell timers.

**Migration:** `ctx.now` and `ctx.spinnerTick` have been removed. Move those reads
into a returned React component using the corresponding hook.

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
store/resolver work; use the `perf` script and workloads in `benchmarks/workloads/` separately
to investigate Ink rendering, logging, and end-to-end overhead.

Run `bun run bench:render` for mounted React/Ink rendering measurements. It uses
100 rows with the four default columns, two warmup rounds and seven measured rounds
of 30 frames each. Cases advance the spinner with all tasks or one task running,
advance elapsed time with one task running, and update one task's counters. Each
frame waits for Ink to flush. Debug mode disables output throttling and writes go
to a sink, so timings include reconciliation, layout, and output generation but
exclude physical terminal latency, real timer delays, and store publication.
JSON includes raw timings and column callback counts; compare the same harness
and runtime across revisions. Single-task frames also include snapshot derivation.

## Effect compatibility

This release targets Effect `4.0.0-rc.112` or newer compatible v4 prereleases. Effect v4 is a release candidate, so its APIs may change before the stable release.
