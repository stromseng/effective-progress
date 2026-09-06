# Development

## TSGO setup

- [Effect TSGO setup guide and README](https://github.com/effect-ts/tsgo#readme)
- [Effect TSGO extension and setup for Zed](https://github.com/RATIU5/zed-effect-tsgo)

## Following a task through the store

Start with `src/api.ts` for the public helpers, then `src/services/progress.ts` for
parent scopes, typed handles, and finalization from an effect's exit.

The store has four responsibilities with separate homes:

- `src/services/store/store.ts` owns current state, task IDs, and atomic mutations.
  Task reads use that current state immediately.
- `src/services/store/task-state.ts` defines task creation, counter normalization,
  updates, progress sample retention, and terminal finalization. Completing known
  work fills remaining units; completing observed unknown work establishes a total.
- `src/services/store/task-tree.ts` maintains depth-first insertion order and removes
  transient subtrees, including their column definitions.
- `src/services/store/snapshot-publisher.ts` owns subscriptions and the 100ms publish
  interval. `getPublishedSnapshot()` returns the stable snapshot consumed by React,
  which can lag behind current task reads. `flush()` synchronously publishes pending
  state before the renderer unmounts.

For example, an increment updates current task counters and records an ETA sample
in one synchronous transition, then schedules publication. Several rapid increments
can share one published snapshot. Changing completion rules belongs in `task-state.ts`;
changing notification cadence belongs in `snapshot-publisher.ts`.

The existing tests describe these boundaries: `tests/runtime.test.ts` covers counters
and inherited policies, `tests/task-finalization.test.ts` and `tests/task-scopes.test.ts`
cover lifecycle and ownership, and `tests/ink-renderer-store.test.ts` covers publishing,
subscriptions, and subtree state. `tests/renderer-lifecycle.test.ts` covers final output
at shutdown.

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

Each built-in column has one home in `src/columns/`: its factory, options, preparation,
size policy, and cell component live together. `src/columns/index.ts` exposes the
existing `Columns` namespace, while renderer internals import the modules they need
directly. To adjust `Columns.bar({ size: "fullwidth" })`, read `bar.tsx` for both
flex sizing and segment rendering. To change the default column sequence, edit
`defaults.ts`.

Keep preparation functions at module scope: grouping uses function identity, so
creating a fresh preparation function inside each factory would split shared groups.
Keep clock subscriptions in the cells that need them; the store publish interval,
spinner clock, elapsed-time clock, and Ink frame limit serve different purposes.

Relevant tests are `tests/prepare-rows.test.ts` for row reuse,
`tests/prepare-columns.test.ts` for preparation identity and binding,
`tests/column-layout.test.tsx` for mixed columns and sizing, and
`tests/renderer-clock-hooks.test.tsx` for selective clock updates. The renderer and
column tests also exercise nested output, narrow widths, amounts, bars, and ETA.
