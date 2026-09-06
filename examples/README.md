# Examples

Run examples from the repository root with `bun examples/<file>.ts`. They simulate
work with sleeps and print progress to your terminal; the complete workflows take
longer than the introductory examples.

## Start here

| Order | File                                   | Learn                                                                   |
| ----- | -------------------------------------- | ----------------------------------------------------------------------- |
| 1     | [single-task.ts](single-task.ts)       | Wrap one effect in a task; watch the spinner complete automatically     |
| 2     | [basic.ts](basic.ts)                   | Track a collection with `all`, limit concurrency, and log while it runs |
| 3     | [nesting.ts](nesting.ts)               | Nest collections and display a task tree                                |
| 4     | [mixed-outcomes.ts](mixed-outcomes.ts) | Compare fail-fast execution with fully accounted result mode            |
| 5     | [custom-columns.ts](custom-columns.ts) | Carry typed metadata through handles into aligned custom columns        |

For example:

```bash
bun examples/basic.ts
bun examples/custom-columns.ts
```

## Complete workflows

- [data-pipeline.ts](workflows/data-pipeline.ts): import files and run nested workers with the high-level helpers.
- [manual-task-control.ts](workflows/manual-task-control.ts): combine high-level tracking with direct service operations for a manually updated task.
- [mixed-columns.ts](workflows/mixed-columns.ts): align different custom column sets for builds, migrations, and cache tasks.
- [showcase.ts](showcase.ts): combine nesting, concurrent work, spinners, and logging.

## Edge cases

- [totals.ts](edge-cases/totals.ts): zero and negative totals, overflow, and empty collections.
- [unknown-total.ts](edge-cases/unknown-total.ts): count successes and failures before the total is known.
- [failure.ts](edge-cases/failure.ts): deliberately fail a collection; an error exit is expected.

## Maintainer tools

See [benchmarks](../benchmarks/README.md) for measurement and profiling commands.
The standalone [Ink box-metrics probe](../tools/ink/box-metrics.tsx) explores Ink layout
without using the Progress API. Run it with `bun tools/ink/box-metrics.tsx`; it keeps
running so you can resize the terminal, and Ctrl+C stops it.
