# Roadmap

- [ ] Clean up architecture and API.
  - [ ] Replace `process.stderr.rows` with a service such that we can mock it alongside the isTTY and others. See effect-platform terminal service. Might have to extend.

- [ ] Move `withTask` error handling out of it and into the higher level foreach and all internals. To support Records and failure modes better later down the line.
  - [ ] Give helpers to override progressbarConfig context. I.e `Progress.withConfig({ ... })`
  - [ ] Optimize task storage to a data structure that natively supports depth first traversal to make printing nested task frames faster.

- [ ] Support full width progress bars. Protect against linewraps. Maybe add progressbars with title above and bar below. Like:

  ```
  Bootstrapping environment
  [=====>             ] 25%
  ```

- [ ] ETA calculation. Deque of last N tasks.
- [ ] Show elapsed Time.
- [ ] Support failing tasks showing as red parts of the progress bar. Support Effect.all modes "validate" and "either". Lets make the completed part of the bar show green, then if we hit a failure make the tip red. (Stop progressing depending on effect mode or accumulate success and errors into the bar)
- [ ] Theme presets. Can simpy be predefined Config layers. `Progress.ProgressConfig.Oldschool` or something.
- [ ] Columns configuration. Pluggable column system — compose [SpinnerColumn(), TextColumn("{task.description}"), BarColumn(), ...] freely
- [ ] Add support for Effect.all Records, not only arrays.
- [ ] Replace Maps with LRU Caches to prevent memory growth on long running tasks with many subtasks.
- [ ] Add non-effect api
