# Roadmap

## Status snapshot (2026-02-17)

- [x] Typed render pipeline (`BuildStage -> ShrinkStage -> ColorStage`).
- [x] `Theme` API replaces `Colorizer` (including per-task override capture).
- [x] Stage-level customization via public services (`BuildStage`, `ShrinkStage`, `ColorStage`, `FrameRenderer`).
- [x] Defaults updated:
  - determinate layout: `single-line`
  - progress bar width: `40`
  - no default `maxTaskWidth` cap
- [x] Tree/multiline connector alignment fixes in TTY mode.
- [x] Transient propagation from parent to descendants.

## Next up

## Customization

- [ ] Custom units (for example `files`, `items`, `MiB`) on determinate tasks.
- [ ] Spinner frame interval as config/service.
- [ ] Theme presets (`Oldschool`, `Minimal`, `Rainbow`) as ready-made layers.
- [ ] Per-task log retention strategy (`all`, `none`, `latestN`).
- [ ] High-level config helper API (`Progress.withConfig(...)`).
- [ ] Pluggable column composition API on top of typed segments.

## Data model / behavior

- [ ] Unify determinate/indeterminate internals (`total?: number` as primary switch).
- [ ] Smoothed ETA (rolling window/deque) instead of lifetime-average rate.
- [ ] Failure-aware determinate bars for `Effect.all` modes (`validate` / `either`), e.g. red failure tip.
- [ ] Better non-TTY strategy and configurability.

## Rendering

- [ ] Split TTY and non-TTY frame renderers into separate services.
- [ ] Add a richer default preset (Rich-inspired compact single-line format).
- [ ] Full-width safety and line-wrap protection options.
- [ ] Optional title-above-bar layout preset for determinate tasks.

## API

- [ ] Rich-style iterator helpers (`Progress.track(...)`).
- [ ] Non-Effect API surface for plain async usage.
- [ ] Better output capture for forked fibers/daemons to prevent frame collisions.
