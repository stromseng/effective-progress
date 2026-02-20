# Roadmap

## Next up

- Look at console.dir usage and format usage internally
- Fixup default eta styling
- figure out how to use terminal color scheme colors (is it just first 16 ansi colors)
- make it easy to configure order of, and which cells are included
- refactor to column based sizing

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
