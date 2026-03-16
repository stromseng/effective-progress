# Plan: Typed Task Metadata + Column-Major Renderer with Custom Columns

## Overview

Two interconnected changes:

1. **Typed metadata API** — attach per-task typed metadata via a callback pattern. Type safety at the API boundary, `unknown` in the store.
2. **Column-major renderer** — replace the current row-major layout + custom width allocator with a column-major flexbox layout. Yoga handles cross-row alignment natively. Custom per-task columns are defined alongside metadata at task creation time.

## Design Principles

- **Additive** — existing `task(effect, options)` API unchanged. Metadata + custom columns are opt-in.
- **Type safety at the boundary** — store is heterogeneous (`unknown`), user code never casts.
- **Yoga-native layout** — column-major flex layout eliminates the custom `planColumnLayout` / `shrinkWidestFirst` / `forceFitFromRight` / `applyStickyGrowth` system (~250 lines). Vertical alignment across rows is free.
- **`useBoxMetrics`** — the patched Ink hook enables adaptive rendering: columns measure their actual post-layout width and adapt content (truncation, fallback variants, hide).

---

## Part 1: Typed Metadata API

### New types

```typescript
// Column definition, generic over metadata shape
// render receives the full TaskSnapshot with metadata typed as M —
// giving access to units, status, timing, description, AND typed metadata
interface TaskColumnDef<M> {
  readonly header: string;
  readonly render: (task: TaskSnapshot & { readonly metadata: M }) => string;
  readonly align?: "left" | "right";
}

// Typed facade — self-contained API scoped to a single task
// No need to separately yield Task or Progress to manipulate the task
interface TaskHandle<M> {
  readonly id: TaskId;
  // Metadata (typed)
  readonly getMetadata: Effect.Effect<M>;
  readonly setMetadata: (metadata: M) => Effect.Effect<void>;
  readonly updateMetadata: (f: (m: M) => M) => Effect.Effect<void>;
  // Task operations (scoped to this task, no taskId needed)
  readonly incrementSucceeded: (amount?: number) => Effect.Effect<void>;
  readonly incrementFailed: (amount?: number) => Effect.Effect<void>;
  readonly update: (options: UpdateTaskOptions) => Effect.Effect<void>;
  readonly complete: Effect.Effect<void>;
  readonly fail: Effect.Effect<void>;
  // Read current snapshot
  readonly getSnapshot: Effect.Effect<TaskSnapshot>;
}
```

### Modified types

```typescript
interface AddTaskOptions<M = void> {
  readonly description: string;
  readonly total?: number;
  readonly transient?: boolean;
  readonly parentId?: TaskId;
  readonly countDisplay?: TaskCountDisplay;
  readonly metadata?: M;
  readonly columns?: ReadonlyArray<TaskColumnDef<M>>;
}
```

### API — callback overload

```typescript
export const task: {
  // Existing — unchanged
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: TaskOptions,
  ): Effect.Effect<A, E, Exclude<R, Progress | Task>>;

  // New — callback receives typed TaskHandle<M>
  // M inferred from options.metadata
  <M, A, E, R>(
    f: (handle: TaskHandle<M>) => Effect.Effect<A, E, R>,
    options: TaskOptions<M> & { metadata: M },
  ): Effect.Effect<A, E, Exclude<R, Progress | Task>>;
};
```

Same overload pattern on `task` in `ProgressService`.

### Type inference flow

```
options.metadata value        →  infer M (= RunResult)
  ↓
options.columns               →  ReadonlyArray<TaskColumnDef<M>>
  ↓                               render: (task: TaskSnapshot & { metadata: M }) => string
callback parameter            →  TaskHandle<M>
  ↓
  handle.getMetadata          →  Effect<M>
  handle.setMetadata          →  (m: M) => Effect<void>
  handle.updateMetadata       →  (f: (m: M) => M) => Effect<void>
```

One inference site (`metadata`), everything else follows.

### Internal cast

The store holds `metadata: unknown`. `TaskHandle<M>` wraps access:

```typescript
const handle: TaskHandle<M> = {
  id: taskId,
  // Metadata — typed facade over untyped store
  getMetadata: progress.getMetadata(taskId) as Effect.Effect<M>,
  setMetadata: (m) => progress.setMetadata(taskId, m),
  updateMetadata: (fn) =>
    Effect.flatMap(progress.getMetadata(taskId), (current) =>
      progress.setMetadata(taskId, fn(current as M)),
    ),
  // Task operations — close over taskId + progress
  incrementSucceeded: (amount) => progress.incrementSucceeded(taskId, amount),
  incrementFailed: (amount) => progress.incrementFailed(taskId, amount),
  update: (options) => progress.updateTask(taskId, options),
  complete: progress.completeTask(taskId),
  fail: progress.failTask(taskId),
  getSnapshot: progress.getTask(taskId).pipe(Effect.map(Option.getOrThrow)),
};
```

The `unknown → M` cast is safe because:

- The slot is initialized with a value of type `M` (from `options.metadata`)
- It's only written to through `handle.setMetadata`, which accepts `M`
- No other code path writes to the same slot with a different type

### Usage example

```typescript
interface RunResult {
  model: string;
  script: string;
  exitCode: number | null;
  durationMs: number;
}

yield *
  Progress.task(
    (handle) =>
      //  ^-- TaskHandle<RunResult>
      Effect.gen(function* () {
        for (let i = 0; i < scripts.length; i++) {
          const result = yield* runScript(model, i);

          // Task operations — no need to yield Task or Progress
          if (result.exitCode === 0) {
            yield* handle.incrementSucceeded();
          } else {
            yield* handle.incrementFailed();
          }

          // Typed metadata
          yield* handle.setMetadata(result);
          //                        ^^^^^^ must be RunResult — type error otherwise

          // Update description dynamically
          yield* handle.update({ description: `[litellm] ${model} (${i + 1}/${scripts.length})` });
        }
      }),
    {
      description: `[litellm] ${model}`,
      total: scripts.length,
      metadata: {
        model: "",
        script: "",
        exitCode: null,
        durationMs: 0,
      } as RunResult,
      columns: [
        // t is TaskSnapshot & { metadata: RunResult } — full snapshot + typed metadata
        { header: "Model", render: (t) => t.metadata.model },
        { header: "Script", render: (t) => t.metadata.script },
        { header: "Exit", render: (t) => String(t.metadata.exitCode ?? "—") },
        { header: "Failed", render: (t) => `${t.units.failed}` }, // snapshot fields too
      ],
    },
  );

// Existing API — unchanged, no metadata
yield * Progress.task(effect, { description: "simple task" });
```

---

## Part 2: Column-Major Renderer

### Architecture shift

**Current (row-major):**

```
<Box flexDirection="column">          ← outer container
  <Box flexDirection="row">           ← row 1 (pre-computed widths)
    <Box width={W1}>desc</Box>
    <Box width={W2}>bar</Box>
    <Box width={W3}>amount</Box>
  </Box>
  <Box flexDirection="row">           ← row 2
    ...
  </Box>
</Box>
```

Each row is an independent flex container. Vertical alignment requires pre-computing column widths across all rows → the custom `planColumnLayout` system (~250 lines).

**Proposed (column-major):**

```
<Box flexDirection="row" columnGap={1}>             ← outer: row of columns
  <Box flexDirection="column" flexGrow={1}>         ← description (fills remaining)
    <Box height={1}>◐ Task A</Box>
    <Box height={1}>◐ Task B</Box>
  </Box>
  <Box flexDirection="column" flexShrink={1}>       ← bar (shrinks before desc)
    <Box height={1}>████████████</Box>
    <Box height={1}>██████</Box>
  </Box>
  <Box flexDirection="column" flexShrink={0}>       ← amount (fixed)
    <Box height={1}>  3/10</Box>
    <Box height={1}>99/100</Box>
  </Box>
  <Box flexDirection="column" flexShrink={0}>       ← elapsed (fixed)
    <Box height={1}>2s</Box>
    <Box height={1}>15s</Box>
  </Box>
  <Box flexDirection="column" flexShrink={0}>       ← "Model" custom column
    <Box height={1}>Qwen-2.5-72B</Box>
    <Box height={1}>Llama-3.3-70B</Box>
  </Box>
</Box>
```

Each column is a `<Box flexDirection="column">`. Yoga computes each column's width as the **max intrinsic width of its children** → vertical alignment is free, no measurement pass needed.

### Why this works with Yoga

In Yoga flexbox, a flex item's cross-axis size (here, width — since each column is `flexDirection="column"`) is determined by its widest child. All children of a column share that width. The outer `flexDirection="row"` container lays out columns side by side.

- **Shrink-wrap**: right-side columns (`flexShrink: 0`) get exactly their content width
- **Fill remaining**: description column (`flexGrow: 1`) takes leftover space
- **Vertical alignment**: free — cells are siblings in the same flex column container

### `useBoxMetrics` integration

The patched `useBoxMetrics` hook provides post-layout measurements. Each column component can read its actual allocated width and adapt:

```tsx
const DescriptionColumnComponent = ({ rows }: { rows: VisibleRow[] }) => {
  const ref = useRef<DOMElement>(null);
  const { width, hasMeasured } = useBoxMetrics(ref);

  return (
    <Box ref={ref} flexDirection="column" flexGrow={1} flexShrink={1}>
      {rows.map((row) => (
        <Box key={row.task.id} height={1}>
          <DescriptionCell row={row} width={hasMeasured ? width : undefined} />
        </Box>
      ))}
    </Box>
  );
};
```

This enables:

1. **Adaptive content** — description column knows its actual width for text truncation. Bar column knows its width for segment rendering. No pre-measurement needed.
2. **Fallback variants** — columns can render different content at different widths (already done in description column: full → indicator+ellipsis → indicator only). Now driven by actual Yoga-computed width instead of pre-allocated width.
3. **Column visibility** — if `useBoxMetrics` reports `width === 0` for a column, it's been squeezed out. Can conditionally render nothing or a minimal indicator.

### Column visibility

No custom column visibility logic for now. Yoga handles layout naturally — columns with `flexShrink={0}` keep their content width, the description column (`flexGrow={1}`) absorbs the squeeze. If the terminal is very narrow, Yoga will shrink columns to their `minWidth`. Column dropping/hiding can be revisited later if needed.

### Custom column alignment across tasks

Different tasks may define different custom columns. Columns with the **same `header` string** align vertically:

```
◐ Task A  ████████   3/10  2s   Qwen-2.5-72B   eval_mcq
◐ Task B  ██████    99/100  15s  Llama-3.3-70B  eval_rag
◐ Task C  ████       5/20  8s                   eval_mcq
                                 ^ Task C has no "Model" column → empty cell
```

**Implementation:**

1. Collect the **union** of all custom column headers across visible rows
2. Build a merged column set, ordered by first appearance
3. For each cell: if the row's task defines that header, call `render(snapshot)`; otherwise render empty

```typescript
const collectCustomColumns = (
  rows: ReadonlyArray<TaskRowModel>,
  columnDefs: Map<TaskId, ReadonlyArray<TaskColumnDef<unknown>>>,
): ReadonlyArray<MergedCustomColumn> => {
  const headerOrder: string[] = [];
  const headerToRenderers = new Map<string, Map<TaskId, (metadata: unknown) => string>>();

  for (const row of rows) {
    const cols = columnDefs.get(row.task.id) ?? [];
    for (const col of cols) {
      if (!headerToRenderers.has(col.header)) {
        headerOrder.push(col.header);
        headerToRenderers.set(col.header, new Map());
      }
      headerToRenderers.get(col.header)!.set(row.task.id, col.render);
    }
  }

  return headerOrder.map((header) => ({
    header,
    renderers: headerToRenderers.get(header)!,
  }));
};
```

Each merged custom column becomes a `<Box flexDirection="column">` in the layout. Cells for tasks without that column render as empty `<Box height={1} />` — Yoga still aligns them vertically.

### Virtual scrolling — removed

The current `ink-virtual-list` is incompatible with column-major layout and is removed entirely. All visible rows render directly. Virtual scrolling can be revisited later if needed for very large task counts.

The `ink-virtual-list` dependency should be removed from `package.json`.

### Built-in column components (rewrite)

Each built-in column becomes a standalone component that renders all its cells as a vertical stack. The existing rendering logic (spinner, bar segments, amount formatting, elapsed/eta formatting) is preserved — only the container structure changes.

**DescriptionColumn:**

```tsx
const DescriptionColumn = ({ rows }: { rows: VisibleRow[] }) => {
  const ref = useRef<DOMElement>(null);
  const { width, hasMeasured } = useBoxMetrics(ref);

  return (
    <Box ref={ref} flexDirection="column" flexGrow={1} flexShrink={1} minWidth={1}>
      {rows.map((row) => (
        <Box key={row.task.id} height={1}>
          <DescriptionCell row={row} width={hasMeasured ? width : undefined} />
        </Box>
      ))}
    </Box>
  );
};
```

- `flexGrow={1}` — fills remaining horizontal space
- `flexShrink={1}` — shrinks if needed
- `useBoxMetrics` provides actual width for text truncation
- Adaptive rendering (full / truncated / indicator-only) based on measured width

**BarColumn:**

```tsx
const BarColumn = ({ rows }: { rows: VisibleRow[] }) => {
  const ref = useRef<DOMElement>(null);
  const { width, hasMeasured } = useBoxMetrics(ref);

  return (
    <Box ref={ref} flexDirection="column" flexShrink={1} flexBasis={30} minWidth={4}>
      {rows.map((row) => (
        <Box key={row.task.id} height={1}>
          <BarCell row={row} width={hasMeasured ? width : 0} />
        </Box>
      ))}
    </Box>
  );
};
```

- `flexBasis={30}` — preferred width
- `flexShrink={1}` — shrinks before description sacrifices space
- `minWidth={4}` — minimum viable bar

**AmountColumn, ElapsedColumn, EtaColumn:**

```tsx
// Pattern for fixed-content columns
const AmountColumn = ({ rows }: { rows: VisibleRow[] }) => (
  <Box flexDirection="column" flexShrink={0}>
    {rows.map((row) => (
      <Box key={row.task.id} height={1} justifyContent="flex-end">
        <AmountCell row={row} />
      </Box>
    ))}
  </Box>
);
```

- `flexShrink={0}` — never shrinks, content-width determined by widest cell
- Right-aligned via `justifyContent="flex-end"` where appropriate

**CustomColumn:**

```tsx
const CustomColumn = ({ column, rows }: { column: MergedCustomColumn; rows: VisibleRow[] }) => (
  <Box flexDirection="column" flexShrink={0}>
    {rows.map((row) => {
      const renderer = column.renderers.get(row.task.id);
      return (
        <Box key={row.task.id} height={1}>
          <Text wrap="truncate-end">{renderer ? renderer(row.task) : ""}</Text>
        </Box>
      );
    })}
  </Box>
);
```

- `flexShrink={0}` — shrink-wrapped to content
- Empty cells for tasks without this column header

### Shrink priority order

When the terminal is too narrow, columns should be removed/shrunk in this priority:

1. **ETA** — least important, dropped first
2. **Elapsed** — dropped second
3. **Custom columns** — dropped right-to-left
4. **Bar** — shrinks (flexShrink={1}), then dropped
5. **Amount** — dropped last of the optional columns
6. **Description** — always visible, shrinks to minWidth

Implemented via the pre-filter approach (Option A above), using estimated widths.

---

## Part 3: Store Changes

### `TaskSnapshot` — add metadata

```typescript
export const TaskSnapshotSchema = Schema.Struct({
  id: TaskIdSchema,
  parentId: Schema.NullOr(TaskIdSchema),
  description: Schema.String,
  status: TaskStatusSchema,
  countDisplay: TaskCountDisplaySchema,
  transient: Schema.Boolean,
  units: TaskUnitsSchema,
  startedAt: Schema.Number,
  completedAt: Schema.NullOr(Schema.Number),
  metadata: Schema.Unknown, // NEW
});
```

### `TaskStore` — add columns map

```typescript
export interface TaskStore {
  readonly tasks: Map<TaskId, TaskSnapshot>;
  readonly renderOrder: ReadonlyArray<RenderRow>;
  readonly columns: Map<TaskId, ReadonlyArray<TaskColumnDef<unknown>>>; // NEW
}
```

Columns contain functions (`render`) and cannot be serialized into Schema. They live in a parallel map, keyed by TaskId, managed alongside the snapshot lifecycle (created in `addTask`, cleaned up in `completeTask`/`failTask` for transient tasks).

### `ProgressRenderStore` — new operations

```typescript
export interface ProgressRenderStore {
  // ... existing methods ...
  readonly setMetadata: (taskId: TaskId, metadata: unknown) => Effect.Effect<void>;
  readonly getMetadata: (taskId: TaskId) => Effect.Effect<unknown>;
}
```

`setMetadata` implementation:

```typescript
setMetadata: (taskId, metadata) =>
  Effect.sync(() => {
    updateState((current) => {
      const currentTask = current.tasks.get(taskId);
      if (!currentTask) return { state: current, events: [] };

      const nextTasks = new Map(current.tasks);
      nextTasks.set(taskId, TaskSnapshot({ ...currentTask, metadata }));

      return {
        state: { ...current, tasks: nextTasks },
        events: [], // or TaskMetadataUpdatedEvent if needed
      };
    });
  }),
```

### `ProgressService` — wire through

```typescript
export interface ProgressService {
  // ... existing methods ...
  readonly setMetadata: (taskId: TaskId, metadata: unknown) => Effect.Effect<void>;
  readonly getMetadata: (taskId: TaskId) => Effect.Effect<unknown>;
}
```

Delegates to store. No new logic.

---

## Part 4: Render Snapshot Changes

### `TaskRowModel` — attach column defs

```typescript
export interface TaskRowModel {
  readonly task: TaskSnapshot;
  readonly tree: TaskTreeInfo;
  readonly derived: TaskRowDerived;
  // columns not needed here — renderer reads from store.columns directly
}
```

Actually, `TaskRowModel` doesn't need to carry column defs. The renderer reads `store.columns` directly when building the merged custom column set. The `TaskRowModel` stays focused on tree/layout derivations.

### `toRenderSnapshot` — unchanged

The render snapshot logic stays the same. It still computes tree info, visibility, and derived properties. The column-major renderer consumes `RenderSnapshot.rows` the same way — it just distributes cells across column components instead of row components.

---

## Part 5: Files Changed

### Deleted

| File                                          | Reason                                      |
| --------------------------------------------- | ------------------------------------------- |
| `src/renderer/width-allocator.ts`             | Replaced by Yoga flexbox layout             |
| `src/renderer/columns/description-column.tsx` | Rewritten as column-major component         |
| `src/renderer/columns/bar-column.tsx`         | Rewritten as column-major component         |
| `src/renderer/columns/amount-column.tsx`      | Rewritten as column-major component         |
| `src/renderer/columns/elapsed-column.tsx`     | Rewritten as column-major component         |
| `src/renderer/columns/eta-column.tsx`         | Rewritten as column-major component         |
| `src/renderer/default-columns.tsx`            | Column set now built into renderer directly |

### New

| File                                          | Purpose                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `src/renderer/columns/description-column.tsx` | Column-major description (preserves rendering logic, new container) |
| `src/renderer/columns/bar-column.tsx`         | Column-major bar (preserves segment rendering)                      |
| `src/renderer/columns/amount-column.tsx`      | Column-major amount (preserves formatting)                          |
| `src/renderer/columns/elapsed-column.tsx`     | Column-major elapsed (preserves formatting)                         |
| `src/renderer/columns/eta-column.tsx`         | Column-major eta (preserves formatting)                             |
| `src/renderer/columns/custom-column.tsx`      | Custom column component for user-defined columns                    |

### Modified

| File                                    | Changes                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/types.ts`                          | `TaskColumnDef<M>`, `TaskHandle<M>`, generic `AddTaskOptions<M>`, `metadata` on snapshot |
| `src/api.ts`                            | Callback overloads on `task()`                                                           |
| `src/services/progress.ts`              | `setMetadata`/`getMetadata`, callback overloads on `task`                                 |
| `src/renderer/store.ts`                 | `columns` map, `setMetadata`/`getMetadata`, metadata in `addTask`                        |
| `src/renderer/store/types.ts`           | No change needed (TaskRowModel stays the same)                                           |
| `src/renderer/store/render-snapshot.ts` | No change needed                                                                         |
| `src/renderer/public-api.tsx`           | Complete rewrite: column-major layout, useBoxMetrics, custom columns                     |
| `src/renderer/renderer-service.tsx`     | Updated to use new renderer, remove column config parameter                              |
| `src/services/ink-renderer.tsx`         | Simplified — no longer passes column definitions                                         |
| `src/index.ts`                          | Export `TaskColumnDef`, `TaskHandle`                                                     |

---

## Implementation Order

### Step 1: Types + Store (metadata foundation)

1. Add `TaskColumnDef<M>`, `TaskHandle<M>` to `src/types.ts`
2. Add `metadata: unknown` to `TaskSnapshotSchema`
3. Add `columns: Map<TaskId, ...>` to `TaskStore`
4. Implement `setMetadata`/`getMetadata` on store
5. Wire through `ProgressService`
6. Update `addTask` to accept and store metadata + columns
7. Clean up columns on task removal

### Step 2: API (callback overloads)

1. Add callback overloads to `task()` in `src/api.ts`
2. Add callback overloads to `task` on `ProgressService`
3. Implement `TaskHandle<M>` construction in the callback path
4. Type-level tests with `expectTypeOf` / `@ts-expect-error`

### Step 3: Column-major renderer

1. Rewrite each built-in column as a column-major component:
   - Preserve existing cell rendering logic (spinners, bar segments, formatting)
   - Wrap in `<Box flexDirection="column">` with `useBoxMetrics`
2. Write `custom-column.tsx` with merged column logic
3. Rewrite `public-api.tsx` as column-major layout
4. Update `renderer-service.tsx` — remove column configuration parameter
5. Update `ink-renderer.tsx` — simplify

### Step 4: Delete old code

1. Remove `width-allocator.ts`
2. Remove `default-columns.tsx`
3. Remove `ink-virtual-list` dependency
4. Clean up unused types (`ProgressColumnDefinition`, `ProgressColumnMeasurement`, etc.)

### Step 5: Tests + Examples

1. Runtime tests for metadata store/service operations
2. Type-level tests for API overloads and inference
3. Update `batchEvalRepro.ts` to use metadata + custom columns
4. Visual testing of column-major layout

---

## Decisions

1. **Initial metadata value** — required. Keeps type inference simple, avoids `M | undefined`.
2. **Column ordering** — custom columns appear after built-in columns, in the order defined in the `columns` array.
3. **`all()` and `forEach()` metadata** — not supported for now. Users can use `task()` + manual `Effect.all`.
4. **Event for metadata updates** — not needed for now.
5. **Header row** — not shown for now.
