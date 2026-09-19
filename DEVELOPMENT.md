# Development

## TSGO setup

- [Effect TSGO setup guide and README](https://github.com/effect-ts/tsgo#readme)
- [Effect TSGO extension and setup for Zed](https://github.com/RATIU5/zed-effect-tsgo)

## How a call flows through the library

Every public entry point ends up in the same pipeline. Reading it top to bottom is the
fastest way to learn the codebase.

1. **Public API** (`src/api/`). `task`, `all`, and `forEach` are the only functions most
   users call. `all` and `forEach` wrap each child effect so its exit increments the parent
   task's counters, then delegate to `task`. `provide-progress.ts` reuses a `Progress`
   service already in the environment or scopes a fresh one around the call, so users never
   provide a layer by hand.
2. **Progress service** (`src/services/progress.ts`). `Progress.layer` wires the store, the
   stdio streams, and the renderer together and starts the renderer when the layer is built.
   The service object is the `TaskOperations` interface (add, update, increment, complete,
   fail, read) plus the `task` runner.
3. **Task runner** (`src/tasks/run-task.ts`). Creates the task, binds a typed `TaskHandle`
   over the store, runs the user's effect with the `Task` tag set to the new task ID, and
   auto-finalizes from the exit. Parent inference uses the `CurrentParent` reference; each
   service instance tags its entries with an owner symbol so nested services with separate
   stores never adopt each other's tasks.
4. **Store** (`src/services/store/`). Owns the immutable `ProgressState` (tasks by ID, depth
   ordered render list, per-task columns). `task-state.ts` holds the pure per-task
   transitions and counter invariants; `task-tree.ts` holds insertion and transient subtree
   removal; `store.ts` composes them and records ETA samples on every processed-count change.
   Reads such as `getTask` see the live state immediately.
5. **Snapshot publisher** (`src/services/store/snapshot-publisher.ts`). Throttles state
   publication to the renderer to one update per 100ms and flushes synchronously on
   shutdown so the final frame is exact.
6. **Renderer** (`src/renderer/`). Subscribes to the published state, derives rows and
   column layout, and renders them with Ink. The section below walks through this stage.

Supporting modules: `src/task-model.ts` defines the `TaskSnapshot` shape and `TaskId`,
`src/progress-estimation.ts` owns ETA sampling and estimation, `src/columns/` holds the
built-in column factories, and `src/terminal/text-width.ts` measures terminal cells.

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
