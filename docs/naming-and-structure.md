# Naming and structure proposal

> **Status: implemented.** The Schema decision below was resolved by switching `TaskSnapshot` to
> `Data.Class` and plain interfaces for the other model types. `useNowClock`, `useSpinnerClock`,
> and `getSpinnerTickAtTime` became module-private inside the merged clock files.

This document proposes concrete fixes for every naming and structure issue found in the
maintainability review. The vocabulary it applies is defined in [CONTEXT.md](../CONTEXT.md);
that file is the single source of truth for what words mean in this repo. This file is the
plan for making the code agree with it.

Pre-1.0 breaking changes are allowed, so public renames are on the table. Each section lists
the change, the reason, and the fallout. The final section orders the work.

## Conventions

These apply to everything below and to new code.

- **One word per concept.** If CONTEXT.md names it, code uses that name. If two words are in
  use, the one not in CONTEXT.md goes.
- **Type names are nouns from the glossary.** `TaskRow`, `ProgressState`, `BoundColumn`.
- **Service tags are bare nouns; their interfaces add `Service`.** `Progress` /
  `ProgressService`, `Renderer` / `RendererService`. This matches Effect's own convention
  (`FileSystem.FileSystem`), so `Progress.Progress` in examples is idiomatic and stays.
- **Files are kebab-case and named after their primary export.** `createTaskRunner` lives
  in `task-runner.ts`, not `run-task.ts`. A `use-` prefix is only for files whose single
  export is a hook.
- **Folders are stages of the flow in DEVELOPMENT.md.** A folder holds one stage; a reader
  can walk the flow by walking the tree.
- **"Snapshot" is reserved for `TaskSnapshot`.** Nothing else is a snapshot.
- **Public exports are grouped by audience** in `src/index.ts` with a comment per group.

## Naming

### Snapshot, state, view

Today "snapshot" names three things: one task, the whole store state, and the prepared rows.

| Current                                                   | Proposed                                         | Where                           |
| --------------------------------------------------------- | ------------------------------------------------ | ------------------------------- |
| `getPublishedSnapshot`                                    | `getPublishedState`                              | store, publisher, hooks, tests  |
| `snapshot-publisher.ts`, `createSnapshotPublisher`        | `state-publisher.ts`, `createStatePublisher`     | `services/store/`               |
| `pendingSnapshot`, `publishedSnapshot`, `initialSnapshot` | `pendingState`, `publishedState`, `initialState` | publisher internals             |
| `RenderSnapshot`                                          | `RenderView`                                     | `prepare-rows.ts`, hooks, tests |
| `useRenderSnapshot`                                       | fold into `useProgressRenderView`                | hooks                           |
| `previousSnapshot`, `previousSnapshotRef`                 | `previousView`, `previousViewRef`                | `prepare-rows.ts`, hooks        |
| `prepareRows(store: ProgressState)`                       | `prepareRows(state: ProgressState)`              | `prepare-rows.ts`               |
| `orderedVisibleTasks(store)`                              | `orderedVisibleTasks(state)`                     | `prepare-rows.ts`               |
| `TaskSnapshot`                                            | unchanged                                        |                                 |

### Row and cell

`CellInfo` is passed and stored as `rows` everywhere. The type should say what the variables
already say.

| Current                          | Proposed               | Notes                                         |
| -------------------------------- | ---------------------- | --------------------------------------------- |
| `CellInfo<M>`                    | `TaskRow<M>`           | public type                                   |
| `render(cell, ctx)`              | `render(row, ctx)`     | parameter name in `ColumnDef`, docs, examples |
| `ColumnRenderContext<P>`         | `CellContext<P>`       | it is per cell: width and prepared value      |
| `TaskRowDerived` / `row.derived` | unchanged, but trimmed | see deletions                                 |
| `TaskTreeInfo` / `row.tree`      | unchanged, but trimmed | see deletions                                 |

### Column, column definition, bound column

The erased type has the natural name and the type users write has the awkward one.

| Current                        | Proposed           | Notes                                                        |
| ------------------------------ | ------------------ | ------------------------------------------------------------ |
| `ColumnDef<M, P>`              | `Column<M, P>`     | what users author; README examples become `Column<EvalMeta>` |
| `Column<M = any>` (erased `P`) | `AnyColumn<M>`     | what task options and the store hold                         |
| `ResolvedColumn`               | `BoundColumn`      | the comment already says "binds"                             |
| `ResolvedColumnPosition`       | `ColumnPosition`   | "resolved" is implied by being output of `resolveColumns`    |
| `AmountLayout`                 | `AmountPrepared`   | matches `BarPrepared`, `DescriptionPrepared`                 |
| `measureAmountLayout`          | `prepareAmount`    | matches `prepareBar`, `prepareDescription`                   |
| `ColumnSizeValue<P>`           | unchanged          |                                                              |
| `resolveColumns`               | unchanged          | "resolve" now means exactly one thing                        |
| `resolveBarSize`               | `normalizeBarSize` | it clamps an option, it does not resolve a position          |

### Task, current task, handle, operations

| Current                                | Proposed                                     | Notes                                                   |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `Task` (Context tag yielding `TaskId`) | `CurrentTask`                                | `yield* Progress.CurrentTask` reads as what it is       |
| `current-task.ts`                      | unchanged                                    | now matches its export                                  |
| `TaskApi<Provided>`                    | `TaskOverloads<Provided>` and stop exporting | it is the overload set of `task()`; users never name it |
| `adaptTaskApi`                         | `adaptTaskOverloads`                         |                                                         |
| `task-api.ts`                          | `task-overloads.ts`                          |                                                         |
| `run-task.ts`                          | `task-runner.ts`                             | file named after `createTaskRunner`                     |
| `CurrentParent`                        | `CurrentParentTask`                          | internal reference; pairs with `CurrentTask`            |
| `TaskHandle`, `bindTaskHandle`         | unchanged                                    |                                                         |
| `TaskOperations`                       | unchanged                                    |                                                         |

### Options

`TrackOptions` introduces "track", a word used nowhere else. The public and service-level
option types should differ by exactly one field.

| Current                                                                          | Proposed         | Notes                                                              |
| -------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| `TrackOptions` (= `AddTaskOptions` minus `parentId`)                             | `TaskOptions<M>` | the public options for `task`, `all`, `forEach`                    |
| `TaskOptions<M> = AddTaskOptions<M>`                                             | removed as alias | `task()` accepts `TaskOptions`; `parentId` becomes service-only    |
| `AddTaskOptions<M>`                                                              | unchanged        | `TaskOptions<M> & { parentId? }`, used by `TaskOperations.addTask` |
| `UpdateTaskOptions`                                                              | unchanged        |                                                                    |
| `AllOptions`, `ForEachOptions`                                                   | unchanged        | now built on `TaskOptions`                                         |
| `EffectExecutionOptions`, `EffectAllExecutionOptions`, `ForEachExecutionOptions` | unchanged        | mirror Effect's names on purpose                                   |

### Store internals

| Current                                            | Proposed                                         | Notes                                                  |
| -------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| `makeProgressStoreRuntime`, `ProgressStoreRuntime` | `makeProgressStoreInternals`, drop the interface | "runtime" collides with Effect's Runtime               |
| `replaceTask`                                      | `replaceTaskAndSample`                           | it also appends a progress sample; the name hides that |
| `modifyTask`                                       | `modifyRunningTask`                              | it silently ignores finalized tasks                    |
| `renderOrder`, `TaskOrderEntry`                    | unchanged                                        |                                                        |

### Renderer internals

| Current                                              | Proposed                                   | Notes                                                        |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `ProgressRoot`                                       | `ProgressApp`                              | it is the Ink root component; "root" collides with root task |
| `ColumnPosition` (component in `progress-table.tsx`) | `ColumnPositionView`                       | frees `ColumnPosition` for the data type                     |
| `RenderedNode`                                       | `CellOutput`                               | it wraps a cell's render result                              |
| `useNowClock`, `useSpinnerClock`                     | unchanged                                  |                                                              |
| `NowProvider`, `SpinnerProvider`                     | `NowClockProvider`, `SpinnerClockProvider` | both are clocks per CONTEXT.md                               |
| `getSpinnerTickAtTime`                               | module-private                             | only the clock hook uses it                                  |

### Public entry point

Group `src/index.ts` by audience, in this order, one comment line per group:

1. High-level API: `task`, `all`, `forEach`, their option and return types.
2. Columns and cells: `Columns`, `Column`, `AnyColumn`, `TaskRow`, `CellContext`,
   `ColumnAlign`, `ColumnSizeValue`, `TaskTreeInfo`, `TaskRowDerived`, `useNow`,
   `useSpinnerTick`.
3. Task model: `TaskId`, `TaskSnapshot`, `TaskStatus`, `TaskUnits`, `TaskCountDisplay`,
   `TaskProgressSample`, `TaskHandle`.
4. Service layer: `Progress`, `ProgressService`, `ProgressStdio`, `ProgressStdioService`,
   `CurrentTask`, `TaskOperations`, `AddTaskOptions`, `UpdateTaskOptions`, `ProgressState`,
   `TaskOrderEntry`.

## Structure

### Target tree

```
src/
  index.ts                     public surface, grouped by audience
  progress.ts                  Progress tag, ProgressService, Progress.layer
  stdio.ts                     ProgressStdio tag and default streams
  api/
    task.ts  all-for-each.ts  provide-progress.ts  infer-total.ts
  tasks/
    model.ts                   TaskId, TaskSnapshot, TaskUnits, isDeterminate   (was task-model.ts)
    options.ts                 TaskOptions, AddTaskOptions, UpdateTaskOptions
    task-operations.ts         TaskOperations interface                          (from services/)
    current-task.ts            CurrentTask tag
    task-handle.ts
    task-runner.ts             createTaskRunner, CurrentParentTask               (was run-task.ts)
    task-overloads.ts          TaskOverloads, adaptTaskOverloads                  (was task-api.ts)
    eta-estimation.ts          appendProgressSample, estimateRemainingMillis      (was progress-estimation.ts)
  store/
    store.ts  state.ts  task-state.ts  task-tree.ts  state-publisher.ts         (was services/store/)
  renderer/
    renderer.tsx  progress-table.tsx  prepare-rows.ts  column-layout.ts  prepare-columns.ts
    render-view.ts             useProgressRenderView                             (was hooks/use-progress-render-view.ts)
    now-clock.tsx              useNowClock, NowClockProvider, useNow             (was context/ + hooks/)
    spinner-clock.tsx          useSpinnerClock, SpinnerClockProvider, useSpinnerTick
  columns/
    types.ts  defaults.ts  description.tsx  bar.tsx  amount.tsx  amount-parts.ts
    elapsed.tsx  eta.tsx  elapsed-eta.tsx  spacer.ts  format.ts
  terminal/
    text-width.ts
```

### Moves and merges

| Change                                                                                                                                             | Reason                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Dissolve `src/services/`. `progress.ts` and `stdio.ts` move to `src/`, `store/` moves to `src/store/`, `task-operations.ts` moves to `src/tasks/`. | The folder claimed to hold services but `Renderer` and `Task` lived elsewhere. After the move, every folder is one stage of the flow. |
| `src/task-model.ts` → `src/tasks/model.ts`, absorbing `columns/determinate.ts`.                                                                    | `isDeterminate` is a fact about a task, not a column. Removes a six-line file.                                                        |
| `src/progress-estimation.ts` → `src/tasks/eta-estimation.ts`.                                                                                      | It is about task progress samples. The new name says what it estimates.                                                               |
| Merge `renderer/context/now-context.tsx` + `renderer/hooks/use-now-clock.ts` → `renderer/now-clock.tsx`; same for spinner.                         | One clock, one file. Update the `no-ambient-nondeterminism` override paths in `.oxlintrc.json` to the new filenames.                  |
| `renderer/hooks/use-progress-render-view.ts` → `renderer/render-view.ts`, inlining `useRenderSnapshot`.                                            | Removes the last `hooks/` and `context/` folders.                                                                                     |
| `columns/column-size.ts` → inline `resolveColumnSizeValue` into `renderer/prepare-columns.ts` and remove it from `Columns`.                        | Its only consumer is `bindColumn`. It was leaking into the public namespace.                                                          |
| `api/collections.ts` → `api/all-for-each.ts`.                                                                                                      | Named after what it exports.                                                                                                          |
| Delete root `index.ts`; point `tsdown.config.ts` entry at `src/index.ts`.                                                                          | One entry point.                                                                                                                      |

### Deletions

| Item                                                                                    | Reason                                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `RenderRow`, `TaskStore` deprecated aliases                                             | Pre-1.0 with breaking changes allowed; nothing uses them.                                               |
| `TaskRowDerived.hasRenderableProgress`, `treePrefixedDescriptionWidth`, `isDeterminate` | Computed, never read by any column or renderer. `isDeterminate(task)` from the model replaces the flag. |
| `TaskTreeInfo.hasChildren`                                                              | Never read. `prepare-rows.ts` loses the `hasChildren` computation and the `treeUnchanged` distinction.  |
| `formatAmount` in `columns/format.ts`                                                   | Used only by tests. Tests should assert on `getAmountParts` or rendered output.                         |
| `getTaskIndicator` export                                                               | Used only by tests. Keep it module-private and test indicators through `renderRows`.                    |
| `Columns.resolveColumnSizeValue`                                                        | Internal helper, see moves.                                                                             |
| `spacer<M>` generic parameter                                                           | Every other factory returns `Column<unknown, ...>`.                                                     |

### Decision: Schema replaced with Data

`src/tasks/model.ts` uses `Schema` only to derive types. Six `*Schema` values are exported and
nothing in `src` decodes with them. This is not a naming issue but it decides what the model
file looks like. Two consistent options:

- **Commit:** keep the schemas, switch numeric fields to `Schema.Finite`, and validate
  `AddTaskOptions` and `UpdateTaskOptions` at the `TaskOperations` boundary so the invariants
  in `task-state.ts` shrink.
- **Drop:** replace with plain interfaces and `Brand.nominal` for `TaskId`, remove the six
  `*Schema` exports, and stop shipping Schema in the bundle.

Resolved: dropped in favor of `Data.Class`. `TaskSnapshot` is a `Data.Class` so snapshots are
immutable readonly values; `TaskUnits`, `TaskProgressSample`, `TaskStatus`, and
`TaskCountDisplay` are plain types. The invariant handling in `task-state.ts` is the boundary.

## Tests

Tests mirror `src/` one folder deep and are named after the unit under test.

| Change                                                                                                                                     | Reason                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add `tests/helpers/progress.ts` exporting `runProgress(effect)` that provides mock stdio and `Progress.layer` and runs to a promise.       | Replaces the `withStdio` / `withProgress` pairs redefined in four files and flattens `Effect.runPromise(withStdio(withProgress(Effect.gen(...))))`. |
| Delete the seven local `makeTask` helpers; import `makeTaskSnapshot` from `tests/helpers/renderer.tsx`.                                    | Already exists.                                                                                                                                     |
| `tests/columns/format.test.ts` → keep amount formatting there; move the "task indicators" block into `tests/columns/description.test.tsx`. | Indicators live in `description.tsx`.                                                                                                               |
| `tests/columns/progress.test.tsx` → `tests/columns/amount.test.tsx`.                                                                       | It tests the amount column.                                                                                                                         |
| Delete `tests/renderer/rows.test.tsx`.                                                                                                     | Its single test guards a removed feature.                                                                                                           |
| `tests/store/`, `tests/tasks/`, `tests/api/`, `tests/renderer/`, `tests/columns/`                                                          | Already match the target tree.                                                                                                                      |

## Documentation follow-through

- README: `ColumnDef` → `Column`, `Column` → `AnyColumn`, `Progress.Task` → `Progress.CurrentTask`,
  `CellInfo` → `TaskRow`, `render(cell, ctx)` → `render(row, ctx)`.
- DEVELOPMENT.md: update the flow section paths after the moves, and add a line pointing at
  CONTEXT.md.
- AGENTS.md: add "Vocabulary is defined in CONTEXT.md; use those terms in code and docs."

## Order of work

Each step leaves `bun run check` and `bun test` green and is one PR.

1. **Deletions.** Remove dead fields, deprecated aliases, test-only exports. Consolidate test
   helpers. No public API change except removing aliases. Smallest diff, clears the ground.
2. **Snapshot / state / view renames.** Internal only. No public API change.
3. **Row, cell, column renames.** Public: `CellInfo` → `TaskRow`, `ColumnDef` → `Column`,
   `Column` → `AnyColumn`, `ColumnRenderContext` → `CellContext`. Update README and examples
   in the same PR.
4. **Task renames and options.** Public: `Task` → `CurrentTask`, `TrackOptions` → `TaskOptions`,
   unexport `TaskApi`. Update README and examples.
5. **Folder moves.** No public API change. Update `.oxlintrc.json` override paths,
   `tsdown.config.ts` entry, DEVELOPMENT.md paths.
6. **Schema decision.** Resolved: `TaskSnapshot` is a `Data.Class`.
7. **Public entry grouping.** Regroup `src/index.ts`; last so it reflects the final names.
