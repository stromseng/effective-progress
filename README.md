# effective-progress

[![npm version](https://img.shields.io/npm/v/effective-progress)](https://www.npmjs.com/package/effective-progress)

> [!WARNING]
> Pre-`1.0.0`, breaking changes may happen in any release. SemVer guarantees will begin at `1.0.0`.  
> I recommend using only the `Progress.all` and `Progress.forEach` APIs for now, as they will likely change the least. The lower-level APIs for manual progress bar control are more likely to see breaking changes as I iterate on the design.
>
> Please open an issue or reach out if you have any questions or want to contribute!
> Feedback and contributions are very welcome!

<img alt="Showcase output" src="docs/images/showcase.gif" width="600" />

`effective-progress` is an [Effect](https://effect.website/)-first terminal progress-bar library with:

- multiple nested tree-like progress bars
- spinner support for “we have no idea how long this takes” work
- clean log rendering alongside progress output, so you can keep using `Console.log` / `Effect.logInfo` without wrecking the UI
- familiar `.all` and `.forEach` APIs — swap `Effect` for `Progress`, get progress bars basically for free
- flicker-free rendering (in theory) by drawing everything in a single terminal frame

## Install

```bash
bun add effective-progress
```

## Usage

This shows the simplest usage: iterate items with a single progress bar.

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

Run:

```bash
bun examples/nesting.ts
```

This demonstrates nested multibar behavior where parent tasks each run their own child progress bars.

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

### Other examples

- `examples/simpleExample.ts` - low-boilerplate real-world flow
- `examples/advancedExample.ts` - full API usage with custom config and manual task control
- `examples/showcase.ts` - nested concurrent tasks, spinner workloads, and mixed Effect/Console logging
- `examples/performance.ts` - stress-style run with high log volume and deeply nested progress updates

## Configuration

### Log retention

- `maxLogLines` on `RendererConfig` controls in-memory log retention.
- Omitted or set to `0` means no log history is kept in memory.
- `maxLogLines > 0` keeps only the latest `N` log lines in memory.

### Configuring renderer and progress bars

Configure global renderer behavior once, and a global base progress bar style:

Defaults:

- columns: `DescriptionColumn`, `BarColumn`, `AmountColumn`, `ElapsedColumn`, `EtaColumn`
- total progress width: `80`
- bar width: `40`

```ts
import { Effect } from "effect";
import * as Progress from "effective-progress";

const configured = program.pipe(
  Effect.provideService(Progress.RendererConfig, {
    width: 80,
    maxLogLines: 12,
    nonTtyUpdateStep: 2,
  }),
  Effect.provideService(Progress.ProgressBarConfig, {
    barWidth: 36,
  }),
);

Effect.runPromise(configured);
```

You can customize column order/content Rich-style by providing a `columns` array:

```ts
const configured = program.pipe(
  Effect.provideService(Progress.RendererConfig, {
    columns: [
      Progress.DescriptionColumn.Default(),
      Progress.BarColumn.make({ track: Progress.Track.fr(1) }),
      Progress.AmountColumn.Default(),
      "•",
      Progress.ElapsedColumn.Default(),
      "•",
      Progress.EtaColumn.Default(),
    ],
  }),
);
```

For full terminal width rendering, set:

```ts
Effect.provideService(Progress.RendererConfig, {
  width: "fullwidth",
});
```

Description-specific caps should be configured on `DescriptionColumn` (for example `DescriptionColumn.make({ maxWidth: 40 })`) rather than globally.

Per top-level call, you can override render config via helper APIs:

```ts
const run = Progress.task(effect, {
  description: "work",
  render: {
    columns: [Progress.DescriptionColumn.Default(), "|", Progress.AmountColumn.Default()],
  },
});

const wrapped = Progress.withRenderConfig(run, {
  columns: [Progress.DescriptionColumn.Default()],
});
```

Task-level `progressbar` config is optional and inherits from its parent task (or from global `ProgressBarConfig` for root tasks):

```ts
yield *
  progress.withTask(Effect.sleep("1 second"), {
    description: "Worker pipeline",
    progressbar: {
      barWidth: 20,
      spinnerFrames: [".", "o", "O", "0"],
    },
  });
```

## Manual task control

For manual usage, `task` captures logs implicitly and provides the current `Task` context:

```ts
const program = Progress.task(
  Effect.gen(function* () {
    const currentTask = yield* Progress.Task;
    yield* Console.log("This log is rendered through progress output", { taskId: currentTask });
    yield* Effect.sleep("1 second");
  }),
  { description: "Manual task" },
);
```

## Column customization

Built-in columns are exported as classes with `Default()` and `make()` helpers.  
You can also pass your own objects/classes implementing `ProgressColumn`:

```ts
const CustomColumn: Progress.ProgressColumn = {
  id: "custom",
  render: () => "extra",
};

const program = Progress.task(myEffect, {
  description: "Work",
  render: {
    columns: [Progress.DescriptionColumn.Default(), Progress.BarColumn.Default(), CustomColumn],
  },
});
```

## Terminal service and mocking

`effective-progress` now exposes a `ProgressTerminal` service that controls terminal detection and I/O:

- `isTTY`
- `stderrRows`
- `stderrColumns`
- `writeStderr(text)`
- `withRawInputCapture(effect)`

You can provide a mock if you want to alter the behavior of terminal detection or if you want to capture the output for testing:

```ts
import { Effect } from "effect";
import * as Progress from "effective-progress";

const mockTerminal: Progress.ProgressTerminalService = {
  isTTY: Effect.succeed(true),
  stderrRows: Effect.succeed(40),
  stderrColumns: Effect.succeed(120),
  writeStderr: (_text) => Effect.void,
  withRawInputCapture: (effect) => effect,
};

const program = Progress.task(Effect.sleep("100 millis"), { description: "work" }).pipe(
  Effect.provideService(Progress.ProgressTerminal, mockTerminal),
);
```

## Dependencies & package size

This library is designed for CLI workflows, where package size is typically a lower-priority concern. Alongside `effect` though, I will strive to only rely on other high quality packages.

## Notes

- As Effect 4.0 is around the corner with some changes to logging, there may be some adjustments needed to align with the new Effect APIs.
