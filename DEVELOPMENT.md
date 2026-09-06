# Development

## TSGO setup

- [Effect TSGO setup guide and README](https://github.com/effect-ts/tsgo#readme)
- [Effect TSGO extension and setup for Zed](https://github.com/RATIU5/zed-effect-tsgo)

## Following a published snapshot to the terminal

The rendering pipeline lives in `src/renderer/`:

1. `hooks/use-progress-render-view.ts` subscribes to published store snapshots with
   `useSyncExternalStore` and memoizes row preparation.
2. `prepare-rows.ts` turns task state into visible rows, tree prefixes, and measured
   description widths. Unchanged rows and tree information retain their identities.
3. `column-layout.ts` groups each row's column definitions by position, selects the
   defaults when needed, and resolves shared sizing hints.
4. `prepare-columns.ts` runs each shared preparation function once per position and
   binds its result to the corresponding render functions and sizing hints.
5. `progress-table.tsx` renders those positions using Ink's measured widths.
   `renderer.tsx` owns mounting, clocks, final flush, and unmounting.

For example, to change how a nested description truncates, start at
`src/columns/description.tsx`. To change which tree connector it receives, follow
its row data back to `src/renderer/prepare-rows.ts`. The store owns tree order and
cleanup; it does not compute glyphs or terminal text widths.

Rows use the same `CellInfo` contract that custom columns receive. The rendering hook exposes
prepared rows, column definitions, and running status; row preparation preserves unchanged row
identities independently of the clock subscriptions.

Each built-in column has one home in `src/columns/`: its factory, options, preparation,
size policy, and cell component live together. `src/columns/index.ts` exposes the
existing `Columns` namespace, while renderer internals import the modules they need
directly. To adjust `Columns.bar({ size: "fullwidth" })`, read `bar.tsx` for both
flex sizing and segment rendering. To change the default column sequence, edit
`defaults.ts`.

Column presentation helpers (`format.ts`, `amount-parts.ts`, and `determinate.ts`) live beside
the columns. Both row preparation and columns use `src/terminal/text-width.ts` for terminal-cell
measurement. Numerical ETA estimation remains in `src/progress-estimation.ts`.

Keep preparation functions at module scope: grouping uses function identity, so
creating a fresh preparation function inside each factory would split shared groups.
Keep clock subscriptions in the cells that need them; the store publish interval,
spinner clock, elapsed-time clock, and Ink frame limit serve different purposes.

Relevant tests are `tests/renderer/prepare-rows.test.ts` for row reuse,
`tests/renderer/prepare-columns.test.ts` for preparation identity and binding,
`tests/renderer/column-layout.test.tsx` for mixed columns and sizing, and
`tests/renderer/clock-hooks.test.tsx` for selective clock updates. The renderer and
column tests also exercise nested output, narrow widths, amounts, bars, and ETA.
