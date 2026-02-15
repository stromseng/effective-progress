# Roadmap

- [ ] Clean up architecture and API.
  - [ ] Replace `process.stderr.rows` with a service such that we can mock it alongside the isTTY and others. See effect-platform terminal service. Might have to extend.
  - [ ] Remove need for Idle Detection etc. Only required for `withCapturedLogs`, might remove it from API.
  - [ ] Might remove entire service api and only provide the `.all` and `.forEach`.
  - [ ] Creat Task Context.Tag to override the effects with `Effect.provideService`. Supports easier api of

  ```ts
  yield *
    Progress.withTask(
      {
        description: "Bootstrapping environment",
      },
      () =>
        Effect.gen(function* () {
          yield* Effect.sleep("2 seconds");
          const allTasksEtc = yield* Progress;
          const currentTask = yield* Task;
        }),
    );
  ```

  - [ ] Give helpers to override progressbarConfig context. I.e `Progress.withConfig({ ... })`

- [ ] ETA calculation. Deque of last N tasks.
- [ ] Show elapsed Time.
- [ ] Support failing tasks showing as red parts of the progress bar. Support Effect.all modes "validate" and "either"
- [ ] Theme presets. Can simpy be predefined Config layers. `Progress.ProgressConfig.Oldschool` or something.
- [ ] Columns configuration. Pluggable column system — compose [SpinnerColumn(), TextColumn("{task.description}"), BarColumn(), ...] freely
- [ ] Add support for Effect.all Records, not only arrays.
- [ ] Replace Maps with LRU Caches to prevent memory growth on long running tasks with many subtasks.
- [ ] Add non-effect api
