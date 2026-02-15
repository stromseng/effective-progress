# Roadmap

## Phase 1 — Foundation cleanup

- [ ] Clean up architecture and API.
- [ ] Replace Maps with LRU Caches to prevent memory growth on long running tasks with many subtasks.

## Phase 2 — Core display features

- [ ] Rethink color styling etc, to allow for multiple chalk styles like strikethrough and color.
- [ ] Show elapsed Time.
- [ ] Allow for individual task maxLogLines configuration. Maybe a per task `logRetentionStrategy` that can be set to "all", "none", or "latestN" with a number.
- [ ] Support failing tasks showing as red parts of the progress bar. Support Effect.all modes "validate" and "either". Lets make the completed part of the bar show green, then if we hit a failure make the tip red. (Stop progressing depending on effect mode or accumulate success and errors into the bar)
- [ ] Support full width progress bars. Protect against linewraps. Maybe add progressbars with title above and bar below. Like:

  ```
  Bootstrapping environment
  [=====>             ] 25%
  ```

## Phase 3 — Extensibility

- [ ] Columns configuration. Pluggable column system — compose [SpinnerColumn(), TextColumn("{task.description}"), BarColumn(), ...] freely
- [ ] ETA calculation. Deque of last N tasks. Becomes a column once the column system exists.
- [ ] Give helpers to override progressbarConfig context. I.e `Progress.withConfig({ ... })`
- [ ] Theme presets. Can simply be predefined Config layers. `Progress.ProgressConfig.Oldschool` or something.

## Phase 4 — New surface area

- [ ] Add non-effect api
