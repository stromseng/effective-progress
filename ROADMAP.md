# Roadmap

## Next up

- Look at console.dir usage and format usage internally
- Fixup default eta styling
- figure out how to use terminal color scheme colors (is it just first 16 ansi colors)
- make it easy to configure order of, and which cells are included
- refactor to column based sizing
- replace chalk dep with `styleText` `import { styleText } from 'node:util'`

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
  - Currently `formatEta` in `renderer.ts:65-78` computes speed as `completed / (now - startedAt)` — the lifetime average. If the first 10% is slow (cold start, initial IO) the ETA stays pessimistically inflated for the entire run; conversely, if early progress is fast then slows, the ETA is optimistically wrong.
  - Store a ring buffer of `{ timestamp: number; completed: number }` samples on each task (capped at ~1000 entries). On each `advanceTask` call, push a new sample and evict entries older than `speedEstimatePeriod` (default 30s, configurable).
  - Compute speed as `deltaCompleted / deltaTime` over only the retained window. ETA = `remaining / speed`.
  - Reference: Rich's `Task` class (`rich/progress.py:1023-1038`) uses a `deque[ProgressSample]` with `maxlen=1000` and a 30s default window. The `speed` property sums recent deltas and divides by window duration.
  - Needs a new field on the task snapshot (e.g. `samples: Array<ProgressSample>`) and a `speedEstimatePeriod` on `RendererConfig`.
- [ ] Failure-aware determinate bars for `Effect.all` modes (`validate` / `either`), e.g. red failure tip.
- [ ] Better non-TTY strategy and configurability.

## Rendering

- [ ] Split TTY and non-TTY frame renderers into separate services.
- [ ] Add a richer default preset (Rich-inspired compact single-line format).
- [ ] Full-width safety and line-wrap protection options.
- [ ] Optional title-above-bar layout preset for determinate tasks.
- [ ] Half-character bar precision using `╸`/`╺` Unicode blocks for 2x visual resolution (Rich-inspired).
  - Currently `BarColumn.render` in `renderer.ts:218` computes `filled = Math.round(ratio * innerWidth)` — whole-character precision. On a 40-char bar each jump is 2.5%, visibly choppy for slow tasks.
  - Change to half-character math: `const completeHalves = Math.floor(ratio * innerWidth * 2); const fullBars = completeHalves >> 1; const hasHalf = completeHalves & 1;`
  - Yield `fillChar.repeat(fullBars)` + (if `hasHalf`) `╸` in complete style, then (if `!hasHalf && fullBars > 0`) `╺` in empty style + `emptyChar.repeat(remaining)`.
  - Characters: `╸` (U+2578, right half) at the filled edge, `╺` (U+257A, left half) at the empty edge. Fall back to plain `━`/`─` when the terminal doesn't support Unicode (check `TERM` or add an `ascii` config flag).
  - Reference: Rich `ProgressBar.__rich_console__` (`rich/progress_bar.py:173-198`) uses `complete_halves = int(width * 2 * completed / total)` with `bar_count = complete_halves // 2` and `half_bar_count = complete_halves % 2`.
- [ ] Smooth boundary transition chars between filled and empty bar regions.
  - Currently the bar has a hard edge: `━━━━━━──────`. Rich renders three distinct visual zones: `━━━━━━╸╺──────` — the `╸` (right-half) ends the filled region and `╺` (left-half) begins the empty region, softening the transition.
  - This can be implemented as part of the half-character precision work above. When there is no half-step but `fullBars > 0`, insert `╺` as the first character of the empty region styled in `emptyStyle`.
  - Largely a freebie if half-character precision is implemented first — the two items share the same render logic change in `BarColumn.render`.
- [ ] Animated pulse bar for indeterminate tasks (scrolling gradient instead of bare spinner).
  - Currently `BarColumn.render` returns `""` for indeterminate tasks (`renderer.ts:207-208`). The only visual indicator is a braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) in the `AmountColumn`.
  - Render a full-width animated bar that scrolls a highlight region across the bar. Two approaches in order of complexity:
    1. **Simple cycling highlight**: Pick a highlight window (e.g. 6 chars of `━` in blue, rest in dim), slide it left each tick using `offset = tick % innerWidth`. No color blending needed — just chalk styling on segments.
    2. **Cosine gradient pulse** (Rich-style): Pre-generate a `PULSE_SIZE` (e.g. 20) segment pattern where each character's color is `0.5 + cos(position * 2π) / 2` blended between foreground and background RGB values. Tile across bar width and shift by `Math.floor(Date.now() / 67) % PULSE_SIZE` each frame. Requires the color system in `src/colors.ts` to support RGB interpolation and truecolor ANSI output (`\x1b[38;2;R;G;Bm`).
  - Reference: Rich `ProgressBar._get_pulse_segments` (`rich/progress_bar.py:70-114`) generates per-character colors via `blend_rgb(fore, back, fade)` where `fade = 0.5 + cos(pos * 2π) / 2`. `_render_pulse` (`rich/progress_bar.py:126-154`) tiles and offsets these segments using `monotonic()` time at speed 15 chars/sec.
  - The `BarColumn` needs to handle `IndeterminateTaskUnits` instead of early-returning. The `variants()` method should also produce shrinkable widths for the pulse bar, same as it does for determinate bars.
- [ ] CJK/wide-character aware width calculation (`wcwidth`-style) instead of codepoint count.
  - Currently `textWidth` in `renderer/ansi.ts:12` is `Array.from(text).length` — codepoint count. A CJK character like `你` counts as 1 but renders as 2 terminal columns. Descriptions containing CJK, emoji, or other wide characters will overflow their allocated column width, breaking the layout.
  - Replace with a proper terminal cell-width function. Options:
    1. Use the `string-width` npm package (well-maintained, handles East Asian Width, emoji, ANSI codes).
    2. Inline a minimal lookup on the Unicode East Asian Width property (ranges for Fullwidth/Wide → 2, everything else → 1). This avoids a dependency but needs updates when Unicode adds blocks.
  - Every call site of `textWidth` and `visibleWidth` in `renderer/ansi.ts` needs to use the new function: `fitPlainText` (line 50), `fitAnsiText` (line 75), `visibleWidth` (line 16), and char counting in the ANSI tokenizer.
  - The ANSI tokenizer (`tokenizeAnsi`, line 18) currently treats each codepoint as a `"char"` token with width 1. It needs to emit the cell width per token so that `fitAnsiText` can correctly count visible columns.
  - Reference: Rich uses `cell_len()` (`rich/cells.py`) which delegates to `wcwidth` for per-character width, properly handling CJK double-width and zero-width combiners.

- A width mode where we simply increase the width if there is space when people have a long task name, then dont decrease it again if that task disappears. Keep columns aligned etc as normal. See `uv sync` for reference
- make effect a peerDependency. Also might have to make the other ones peer deps as well

## API

- [ ] Rich-style iterator helpers (`Progress.track(...)`).
- [ ] Non-Effect API surface for plain async usage.
- [ ] Better output capture for forked fibers/daemons to prevent frame collisions.
