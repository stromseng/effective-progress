# effective-progress

> [!WARNING]
> Pre-`1.0.0`, breaking changes may happen in any release. SemVer guarantees will begin at `1.0.0`.
> Please open an issue or reach out if you have any questions or want to contribute!

<img alt="Showcase output" src="docs/images/showcase.gif" width="600" />

`effective-progress` is an [Effect](https://effect.website/)-first terminal progress library with:

- multiple progress bars
- nested child progress bars
- spinner support for indeterminate work
- clean log rendering alongside progress output, allowing you to simply use Effects `Console.log` or `Effect.logInfo`.

## Install

```bash
bun add effective-progress
```

This shows the simplest usage: iterate 100 items with a single progress bar.

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

```bash
bun run examples/basic.ts
Completed task 1
Completed task 2
- Running tasks in parallel: ━━━━━━━━━━━━────────────────── 2/5  40%
```

## Nested example

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

```bash
❯ bun run examples/nesting.ts
- Running tasks in parallel: ━━━━━━━━━━━━────────────────── 2/5  40%
  - Running subtasks for task 3: ━━━━━━━━────────────────────── 4/15  27%
  - Running subtasks for task 4: ━━━━━━━━────────────────────── 4/15  27%
```

## Other examples

- `examples/simpleExample.ts` - low-boilerplate real-world flow
- `examples/advancedExample.ts` - full API usage with custom config and manual task control
- `examples/showcase.ts` - nested concurrent tasks, spinner workloads, and mixed Effect/Console logging

## Log retention

- `renderer.maxLogLines` controls in-memory log retention.
- `renderer.maxLogLines` omitted or set to `0` means no log history is kept in memory.
- `renderer.maxLogLines > 0` keeps only the latest `N` log lines in memory.

## Progress bar colors

`progressbar.colors` is configured with typed color tokens that are validated by Effect Schema.

```ts
progressbar: {
  spinnerFrames: ["-", "\\", "|", "/"],
  barWidth: 30,
  fillChar: "━",
  emptyChar: "─",
  leftBracket: "",
  rightBracket: "",
  colors: {
    fill: { kind: "named", value: "cyan" },
    empty: { kind: "hex", value: "#9ca3af", modifiers: ["dim"] },
    brackets: { kind: "rgb", value: { r: 156, g: 163, b: 175 } },
    percent: { kind: "named", value: "whiteBright", modifiers: ["bold"] },
    spinner: { kind: "ansi256", value: 214 },
    done: { kind: "named", value: "greenBright" },
    failed: { kind: "named", value: "redBright", modifiers: ["bold"] },
  },
}
```

Supported color styles:

- `named` (for example `cyan`, `greenBright`)
- `hex` (for example `#00b894`)
- `rgb` (for example `{ r: 0, g: 184, b: 148 }`)
- `ansi256` (for example `214`)

Supported modifiers:

- `bold`, `dim`, `italic`, `underline`, `inverse`, `hidden`, `strikethrough`

## Dependencies & package size

The only dependencies in this project are `effect` and `chalk`. You will already be dependant on `effect` and most likely `chalk` if doing any coloring, so package size likely wont be a concern.

## Notes

- This is a WIP library, so expect breaking changes. Feedback and contributions are very welcome!
- As Effect 4.0 is around the corner with some changes to logging, there may be some adjustments needed to align with the new Effect APIs.
