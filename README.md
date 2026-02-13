# effective-progress

`effective-progress` is an Effect-first terminal progress library with:

- multiple progress bars
- nested child progress bars
- spinner support for indeterminate work
- clean log rendering alongside progress output

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
  { description: "Running tasks in parallel", all: { concurrency: 2 } },
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
  { description: "Running tasks in parallel", all: { concurrency: 2 } },
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
