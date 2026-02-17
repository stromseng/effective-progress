# Roadmap

- Split TTY mode and Non TTY mode into two different services.

## Customization

- Allow custom units, so 5/10 tasks, 5/10 files etc
- Support nested color palette by depth
- Allow for individual task maxLogLines configuration. Maybe a per task `logRetentionStrategy` that can be set to "all", "none", or "latestN" with a number.
- Ability to set spinner frame interval
- Add BarRenderer as a service people can override to further customize rendering. Replaces `buildTaskLine` with the service. make sure to give it more inputs like delta time, terminal size etc. Need to handle multiline renders properly. Should allow setting custom task metadata such that we can render it, i.e. download size in MB etc. (maybe allow for simple column overrides here idk yet).
- Support full width progress bars. Protect against linewraps. Maybe add progressbars with title above and bar below. Like:
- Columns configuration. Pluggable column system — compose [SpinnerColumn(), TextColumn("{task.description}"), BarColumn(), ...] freely
- Give helpers to override progressbarConfig context. I.e `Progress.withConfig({ ... })`
- Theme presets. Can simply be predefined Config layers. `Progress.ProgressConfig.Oldschool` or something.

## Data model / behavior

- ETA calculation. Deque of last N tasks. Becomes a column once the column system exists.

- Support failing tasks showing as red parts of the progress bar. Support Effect.all modes "validate" and "either". Lets make the completed part of the bar show green, then if we hit a failure make the tip red. (Stop progressing depending on effect mode or accumulate success and errors into the bar)

  ```
  Bootstrapping environment
  [=====>             ] 25%
  ```

- Add a simple default rich like progress-bar  
   ⠏ scene_understanding ━━━━━━━━━━━━━━━━━━━━━━━╺━━━━━━━━━━━━━━━━ 23/40 0:00:51 ETA: 0:00:33

- Support Rich tree like rendering with lines drawn to each item

```
root
├─ src
│  ├─ main.py
│  └─ utils.py
└─ README.md
```

- Rework non TTY mode for better configuration and consistency.

## API

- rich style track() iterator? `for x of Progress.track(...)`
- Add non-effect api
- Add support for capturing output from forked daemons and other fibers to avoid collision. Might require a top level service to capture all logs at all times.
