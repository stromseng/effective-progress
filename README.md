# effective-progress

[![npm version](https://img.shields.io/npm/v/effective-progress)](https://www.npmjs.com/package/effective-progress)

> [!WARNING]
> Pre-`1.0.0`, breaking changes may happen in any minor release. SemVer guarantees will begin at `1.0.0`.  
> I recommend using only the `Progress.all` and `Progress.forEach` APIs for now, as they will likely change the least. The lower-level APIs for manual progress bar control are more likely to see breaking changes as I iterate on the design.
>
> Please open an issue or reach out if you have any questions or want to contribute!
> Feedback and contributions are very welcome!

<img alt="Showcase output" src="docs/images/showcase.gif" width="600" />

`effective-progress` is an [Effect](https://effect.website/)-native CLI progress bar library with:

- multiple nested tree-like progress bars
- spinner support for “we have no idea how long this takes” work
- keep using `Console.log` / `Effect.logInfo` while progress rendering is active
- familiar `.all` and `.forEach` APIs — swap `Effect` for `Progress`, get progress bars basically for free
- flicker-free rendering with [Ink](https://github.com/vadimdemedes/ink)

## Install

```bash
bun add effective-progress
```

## Usage

Iterate items with a single progress bar.

```ts
import { Console, Effect } from "effect";
import * as Progress from "effective-progress";

const program = Progress.all(
  Array.from({ length: 5 }).map((_, i) =>
    Effect.gen(function* () {
      yield* Effect.sleep("1 second");
      yield* Console.log(`Completed task ${i + 1}`);
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

### Effect.all modes

Support for `either`/`validate` modes of `Effect.all` and render the amount of successes/failures.

<img alt="Mixed outcomes modes output" src="docs/images/mixedOutcomes.gif" width="600" />

- `Progress.all` in default mode (`mode: "default"`) remains fail-fast.
- In fail-fast runs, unresolved units remain unprocessed.
- `mode: "either"` and `mode: "validate"` run all effects and keep mixed outcomes in the task counters.
- Mixed outcomes can finalize as `done` when all units are accounted for.
- Empty collections are valid inputs for `Progress.all` / `Progress.forEach` and render as `0/0` instead of failing.

### Single task with a typed handle

Use `Progress.task(...)` when you want one progress bar around a custom effect. The callback form gives you a task-local handle, so you can update counts, descriptions, and metadata without fetching the current task ID first.

```ts
import { Console, Effect } from "effect";
import * as Progress from "effective-progress";

const program = Progress.task(
  (task) =>
    Effect.gen(function* () {
      yield* Console.log("Starting deployment");
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
- `examples/mixedOutcomes.ts` - fail-fast vs `either`/`validate` with mixed success/failure counters
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

### Console behavior

- The Ink renderer runs with `patchConsole: true`, so console output is patched by Ink while the app is mounted.
- `Progress.task`, `Progress.all`, and `Progress.forEach` write through the currently provided Effect `Console` implementation.
- Formatting is controlled by the API consumer's logger/console implementation.

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

Example using the lower-level service API:

```ts
import { Console, Effect } from "effect";
import * as Progress from "effective-progress";

const program = Progress.task(
  Effect.gen(function* () {
    const progress = yield* Progress.Progress;
    const currentTask = yield* Progress.Task;
    yield* Console.log("This log is handled by the outer Console", { taskId: currentTask });

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

## Notes

- As Effect 4.0 is around the corner with some changes to logging, there may be some adjustments needed to align with the new Effect APIs.
