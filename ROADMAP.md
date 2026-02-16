# Roadmap

## Phase 2 — Core display features

- [ ] Support nested color palette by depth
- [ ] Allow for individual task maxLogLines configuration. Maybe a per task `logRetentionStrategy` that can be set to "all", "none", or "latestN" with a number.
- [ ] Support failing tasks showing as red parts of the progress bar. Support Effect.all modes "validate" and "either". Lets make the completed part of the bar show green, then if we hit a failure make the tip red. (Stop progressing depending on effect mode or accumulate success and errors into the bar)
- [ ] Support full width progress bars. Protect against linewraps. Maybe add progressbars with title above and bar below. Like:

  ```
  Bootstrapping environment
  [=====>             ] 25%
  ```

- [ ] Add a simple default rich like progress-bar  
       ⠏ scene_understanding ━━━━━━━━━━━━━━━━━━━━━━━╺━━━━━━━━━━━━━━━━ 23/40 0:00:51 ETA: 0:00:33

## Phase 3 — Extensibility

- [ ] Columns configuration. Pluggable column system — compose [SpinnerColumn(), TextColumn("{task.description}"), BarColumn(), ...] freely
- [ ] ETA calculation. Deque of last N tasks. Becomes a column once the column system exists.
- [ ] Give helpers to override progressbarConfig context. I.e `Progress.withConfig({ ... })`
- [ ] Theme presets. Can simply be predefined Config layers. `Progress.ProgressConfig.Oldschool` or something.

- [ ] Rework non TTY mode for better configuration and consistency.

## Phase 4 — New surface area

- [ ] Add non-effect api
- [ ] Add support for capturing output from forked daemons and other fibers to avoid collision. Might require a top level service to capture all logs at all times.
