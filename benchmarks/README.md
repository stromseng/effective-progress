# Benchmarks and profiling

Run commands from the repository root. Keep the runtime, machine, and background load
consistent when comparing revisions. These programs measure different parts of the
system; terminal workloads include logging and sleeps, while the measurement harnesses
control those costs.

| Command                                     | Program                                                  | Purpose                                                                                         |
| ------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `bun run bench`                             | [store-and-columns.ts](store-and-columns.ts)             | Store updates and column preparation/layout, with correctness assertions outside timed sections |
| `bun run bench:render`                      | [rendering.ts](rendering.ts)                             | Mounted React/Ink frame measurements using a sink instead of a physical terminal                |
| `bun run perf`                              | [workloads/progress.ts](workloads/progress.ts)           | CPU profile of nested tasks with a high volume of logs                                          |
| `bun benchmarks/workloads/progress-long.ts` | [workloads/progress-long.ts](workloads/progress-long.ts) | Longer terminal stress run with roughly ten times the work                                      |
| `bun benchmarks/workloads/compare.ts`       | [workloads/compare.ts](workloads/compare.ts)             | Run the short workload without and then with progress tracking                                  |
| `bun benchmarks/workloads/compare-long.ts`  | [workloads/compare-long.ts](workloads/compare-long.ts)   | Compare the longer workload without and with tracking                                           |

The measurement harnesses emit JSON with individual samples and runtime information.
Alternate revisions across several runs and compare median timings and sample spread.
The comparison workloads run the bare version first and the tracked version second;
their wall-clock overhead figures are useful for investigation, not isolated microbenchmarks.

[workloads/workload.ts](workloads/workload.ts) owns the shared short/long workload parameters
so standalone runs and comparisons stay consistent. The [rendering/](rendering/) directory
contains recorded rendering results; scripts do not overwrite them automatically.

For API usage examples, start with the [example catalog](../examples/README.md).
