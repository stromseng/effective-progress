# Roadmap

- [ ] Clean up architecture and API.
  - [ ] Replace `process.stderr.rows` with a service such that we can mock it alongside the isTTY and others. See effect-platform terminal service. Might have to extend.
  - [ ] Remove need for Idle Detection etc. Only required for `withCapturedLogs`, might remove it from API.
  - [ ] Might remove entire service api and only provie the `.all` and `.forEach`.

- [ ] ETA calculation
- [ ] Show elapsed Time
- [ ] Support failing tasks showing as red parts of the progress bar. Support Effect.all modes "validate" and "either"
- [ ] Theme presets
- [ ] Columns configuration
- [ ] Add support for Effect.all Records, not only arrays.
- [ ] Replace Maps with LRU Caches to prevent memory growth on long running tasks with many subtasks.
- [ ] Add non-effect api
