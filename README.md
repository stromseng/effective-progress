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

Support for `either`/`validate` modes of `Effect.all` and render the amount of sucesses/failures.

<img alt="Mixed outcomes modes output" src="docs/images/mixedOutcomes.gif" width="600" />

- `Progress.all` in default mode (`mode: "default"`) remains fail-fast.
- In fail-fast runs, unresolved units remain unprocessed.
- `mode: "either"` and `mode: "validate"` run all effects and keep mixed outcomes in the task counters.
- Mixed outcomes can still finalize as `done` when all units are accounted for.
- Empty collections are valid inputs for `Progress.all` / `Progress.forEach` and render as `0/0` instead of failing.

### Other examples

- `examples/simpleExample.ts` - low-boilerplate real-world flow
- `examples/advancedExample.ts` - full API usage and manual task control
- `examples/mixedOutcomes.ts` - fail-fast vs `either`/`validate` with mixed success/failure counters
- `examples/cliProgressSemantics.ts` - zero totals, negative totals clearing to unknown totals, overflow counts, and empty `all` / `forEach`
- `examples/unknownTotalCounting.ts` - count successes/failures without a known total and render `processed/?`
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
- Built-in columns are: description, bar, amount/spinner, elapsed, and ETA.
- Determinate bars are segmented by outcome: succeeded (green), failed (red), and remaining (neutral).
- Determinate amount text shows counters without prefixes: `<succeeded> <failed> <processed>/<total>`.
- Counts can exceed `total`; the amount text keeps those raw values (for example `12/10`) while the bar stays visually clamped at full.
- `total: 0` is valid for determinate tasks and renders as a full bar by default.
- Column widths are measured and allocated per frame from a shared column tree, so rows stay aligned.
- Elapsed and ETA reserve stable widths to reduce jitter while tasks transition states.
- Sticky width can keep selected columns stable until the frame empties.
- On narrow terminals, layout compacts to fit available width and tree prefixes are suppressed when description space is too tight.

## Manual task control

For manual usage, `task` still provides the current `Task` context, while logs continue through your outer `Console`:

```ts
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

## Column customization

Custom column APIs are not part of the first Ink release. The renderer ships with built-in columns only, and old renderer config APIs (`RendererConfig`, `ProgressBarConfig`, custom column definitions) are intentionally removed in this iteration.

## Notes

- As Effect 4.0 is around the corner with some changes to logging, there may be some adjustments needed to align with the new Effect APIs.
