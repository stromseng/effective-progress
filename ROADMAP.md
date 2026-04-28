# Roadmap

`effective-progress` is now on the Ink-based renderer with nested tasks, mixed-outcome counters, column-tree width allocation, and wide-character-aware width measurement. This roadmap keeps the design notes for items that are still not implemented.

## Next up

- fix new renderer eta popin / layout shift
- configurable transient/cleanup mode, clear fully on completion, leave completion message, leave full bar
- add speed calculation column, I.e 100/s or download speed 200Mbit/s etc.
- allow precreating tasks then passing them to the public APIs, `.all` `.foreach` to have them use an existing task instead of creating a new one, to allow for showing the upcoming tasks, even though they are executed lazily.
- make `SNAPSHOT_PUBLISH_INTERVAL_MILLIS` and other rendering constants etc be effect Configs.
- make preallocated task description space configurable

## Customization

- [ ] Custom units (for example `files`, `items`, `MiB`) on determinate tasks.
- [ ] Spinner frame interval as config/service.
- [ ] Theme presets (`Oldschool`, `Minimal`, `Rainbow`) as ready-made layers.
- [ ] High-level config helper API (`Progress.withConfig(...)`).

## Data model / behavior

- [ ] Better non-TTY strategy and configurability.

## Rendering

- [ ] Optional title-above-bar layout preset for determinate tasks.
- [ ] Half-character bar precision using `╸`/`╺` Unicode blocks for 2x visual resolution (Rich-inspired).
  - Currently `BarColumn` computes `filled = Math.round(ratio * innerWidth)` - whole-character precision. On a 40-char bar each jump is 2.5%, visibly choppy for slow tasks.
  - Change to half-character math: `const completeHalves = Math.floor(ratio * innerWidth * 2); const fullBars = completeHalves >> 1; const hasHalf = completeHalves & 1;`
  - Yield `fillChar.repeat(fullBars)` + (if `hasHalf`) `╸` in complete style, then (if `!hasHalf && fullBars > 0`) `╺` in empty style + `emptyChar.repeat(remaining)`.
  - Characters: `╸` (U+2578, right half) at the filled edge, `╺` (U+257A, left half) at the empty edge. Fall back to plain `━`/`─` when the terminal doesn't support Unicode (check `TERM` or add an `ascii` config flag).
  - Reference: Rich `ProgressBar.__rich_console__` (`rich/progress_bar.py:173-198`) uses `complete_halves = int(width * 2 * completed / total)` with `bar_count = complete_halves // 2` and `half_bar_count = complete_halves % 2`.
- [ ] Smooth boundary transition chars between filled and empty bar regions.
  - Currently the bar has a hard edge: `━━━━━━──────`. Rich renders three distinct visual zones: `━━━━━━╸╺──────` - the `╸` (right-half) ends the filled region and `╺` (left-half) begins the empty region, softening the transition.
  - This can be implemented as part of the half-character precision work above. When there is no half-step but `fullBars > 0`, insert `╺` as the first character of the empty region styled in `emptyStyle`.
  - Largely a freebie if half-character precision is implemented first - the two items share the same render logic change in `BarColumn.render`.
- [ ] Animated pulse bar for indeterminate tasks (scrolling gradient instead of bare spinner).
  - Currently `BarColumn` returns `""` for indeterminate tasks. The only visual indicator is a braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) in the `AmountColumn`.
  - Render a full-width animated bar that scrolls a highlight region across the bar. Two approaches in order of complexity:
    1. **Simple cycling highlight**: Pick a highlight window (e.g. 6 chars of `━` in blue, rest in dim), slide it left each tick using `offset = tick % innerWidth`. No color blending needed - just chalk styling on segments.
    2. **Cosine gradient pulse** (Rich-style): Pre-generate a `PULSE_SIZE` (e.g. 20) segment pattern where each character's color is `0.5 + cos(position * 2π) / 2` blended between foreground and background RGB values. Tile across bar width and shift by `Math.floor(Date.now() / 67) % PULSE_SIZE` each frame.
  - Reference: Rich `ProgressBar._get_pulse_segments` (`rich/progress_bar.py:70-114`) generates per-character colors via `blend_rgb(fore, back, fade)` where `fade = 0.5 + cos(pos * 2π) / 2`. `_render_pulse` (`rich/progress_bar.py:126-154`) tiles and offsets these segments using `monotonic()` time at speed 15 chars/sec.
  - The `BarColumn` needs to handle `IndeterminateTaskUnits` instead of early-returning.
- A width mode where we simply increase the width if there is space when people have a long task name, then dont decrease it again if that task disappears. Keep columns aligned etc as normal. See `uv sync` for reference
- make sure things like inquirer.js works

## API

- Add a stream API for which you can set an optional total, should only show count of completed effects if no total.
- [ ] Rich-style iterator helpers (`Progress.track(...)`).
- [ ] Non-Effect API surface for plain async usage.
- [ ] Better output capture for forked fibers/daemons to prevent frame collisions.

## Future development

- allow for arbitrary rendering/output API, so we can use it for general task tracking in a backend for example. Could allow backends to easily track task progress and report through a web api.
