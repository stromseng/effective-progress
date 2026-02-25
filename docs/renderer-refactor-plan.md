# Renderer Refactor Plan (Post-Variant Complexity)

## 1. Problem Statement

The current renderer implementation in `src/renderer.ts` mixes several concerns in one file:

- built-in column definitions
- tree prefix computation
- ANSI parsing and fitting
- width distribution and shrink logic
- variant downgrade selection
- frame materialization
- TTY/non-TTY render loop orchestration

This makes debugging difficult. Recent issues (for example unbound method references, variant downgrade ordering, and TTY styling interactions) were hard to isolate because responsibilities are coupled.

## 2. Goals

- Reduce cognitive load by splitting the renderer into focused modules.
- Make layout + variant selection a pure, testable pipeline.
- Preserve external behavior and public API unless explicitly noted.
- Improve test precision so regressions are caught in unit tests before integration tests.

## 3. Non-Goals

- No feature redesign of columns, tracks, or render loop behavior.
- No async/effectful column rendering in this refactor.
- No change to user-facing configuration semantics (`width`, `columns`, `columnGap`, etc.).

## 4. Target Architecture

### 4.1 File Split

Create the following modules under `src/renderer/`:

- `types.ts`
- `tree.ts`
- `ansi.ts`
- `layout.ts`
- `variants.ts`
- `frame.ts`
- `columns.ts`
- `loop.ts`
- `index.ts`

Keep `src/renderer.ts` as a compatibility barrel that re-exports from `src/renderer/index.ts` and exposes `FrameRenderer`.

### 4.2 Module Responsibilities

#### `src/renderer/types.ts`

- Shared renderer model types.
- `ColumnTrack`, `Track`, `CellWrapMode`.
- `ProgressColumnContext`, `ProgressColumn`, `ProgressColumnVariant`.
- Small DTOs used by pure layout/frame functions:
  - `LayoutInput`
  - `LayoutResult`
  - `VariantResolutionResult`

#### `src/renderer/tree.ts`

- `TaskTreeInfo` definition.
- `computeTreeInfo(...)`.
- `renderTreePrefix(...)` and any related helpers.

#### `src/renderer/ansi.ts`

- `stripAnsi(...)`
- `visibleWidth(...)`
- `fitRenderedText(...)`
- ANSI tokenization internals

#### `src/renderer/layout.ts`

- Pure width distribution and shrink math:
  - ratio distribution
  - track resolution
  - min/max bounds
  - priority shrink and proportional shrink
- Expose a single pure entrypoint:
  - `resolveColumnWidths(input: LayoutInput): LayoutResult`

#### `src/renderer/variants.ts`

- Pure variant resolver logic:
  - `resolveVariantForLevel(...)`
  - `resolveVariantLevels(...)`
- Encapsulate downgrade criteria:
  - overflow before shrink
  - compressed columns (assigned < intrinsic)

#### `src/renderer/frame.ts`

- Build frame lines from ordered tasks and columns.
- No terminal I/O side effects.
- Uses `tree`, `variants`, `layout`, `ansi` modules.

#### `src/renderer/columns.ts`

- Built-in columns:
  - `DescriptionColumn`
  - `BarColumn`
  - `AmountColumn`
  - `ElapsedColumn`
  - `EtaColumn`
  - `LiteralColumn`
  - `Columns.defaults()`
- Keep styling behavior exactly as currently implemented.

#### `src/renderer/loop.ts`

- `FrameRendererService`.
- TTY session management, render loop, non-TTY signature updates.
- Calls pure frame rendering (`renderTaskFrame`) and writes output.

#### `src/renderer/index.ts`

- Public exports for all renderer contracts/classes.
- Expose `FrameRenderer` context tag + default layer.

## 5. Public API Policy During Refactor

- Keep existing exports and names stable:
  - `FrameRenderer`
  - column classes and `Columns`
  - renderer types/interfaces used externally
- No user migration required for this refactor.

## 6. Implementation Phases

### Phase 0: Baseline and Safety Net

1. Snapshot current behavior with focused tests before moving code.
2. Add temporary targeted tests for known sensitive paths:
   - variant downgrade under narrow widths
   - ANSI + compact variants in TTY
   - non-TTY ANSI stripping

Deliverable:

- Current tests all green.

### Phase 1: Extract Pure Utilities

1. Move ANSI functions to `ansi.ts`.
2. Move tree computation/prefix logic to `tree.ts`.
3. Keep behavior byte-for-byte equivalent.

Deliverable:

- No behavior changes.
- Imports updated in `renderer.ts`.

### Phase 2: Extract Layout Engine

1. Move track resolution and shrink math to `layout.ts`.
2. Introduce explicit `LayoutInput` and `LayoutResult`.
3. Ensure `overflowBeforeShrink` remains available in result.

Deliverable:

- Unit tests for `layout.ts` cover:
  - fixed/auto/fraction behavior
  - priority shrink order
  - proportional fallback
  - min/max enforcement

### Phase 3: Extract Variant Resolver

1. Move variant selection logic to `variants.ts`.
2. Expose deterministic `resolveVariantLevels(...)` that takes:
   - contexts
   - columns
   - total width + gap
3. Keep downgrade strategy stable:
   - downgrade while overflow/compression persists
   - reduction-first then collapse-priority tie-break

Deliverable:

- Unit tests for `variants.ts` cover:
  - no variants path
  - single-column variants
  - multi-column tie-breaks
  - compression-only downgrade trigger

### Phase 4: Extract Frame Builder

1. Move `renderTaskFrame(...)` to `frame.ts`.
2. Keep it pure (no terminal writes, no refs/effects).
3. Inject dependencies via imports (`tree`, `variants`, `layout`, `ansi`).

Deliverable:

- Unit tests for `frame.ts` cover:
  - active column filtering
  - width-constrained output
  - variant-applied output with expected text

### Phase 5: Isolate Render Loop

1. Move loop/session code to `loop.ts`.
2. Keep `FrameRenderer.Default` behavior unchanged.
3. Confirm cursor hide/show and final flush behavior.

Deliverable:

- Existing integration tests pass unchanged.

### Phase 6: Recompose Public Surface

1. Build `src/renderer/index.ts` export map.
2. Convert `src/renderer.ts` to a small compatibility layer:
   - re-export public items
   - preserve import paths for existing users

Deliverable:

- No external import breakage for current consumers.

### Phase 7: Cleanup

1. Remove dead helpers from old file.
2. Normalize naming and comments across new modules.
3. Ensure no duplicate logic remains.

Deliverable:

- Clean module graph and no lint dead-code warnings.

## 7. Testing Strategy

### 7.1 New Unit Test Files

- `tests/renderer-layout.test.ts`
- `tests/renderer-variants.test.ts`
- `tests/renderer-frame.test.ts`
- `tests/renderer-ansi.test.ts`

### 7.2 Existing Test Files to Keep

- `tests/renderer-tty.test.ts`
- `tests/run.test.ts`
- `tests/runtime-config.test.ts`

### 7.3 Critical Assertions

- Tree prefix removed under compact variant in narrow widths.
- ETA label removed under compact variant in narrow widths.
- No ANSI corruption during truncation.
- TTY and non-TTY render loops still finalize correctly.

## 8. Risk Register and Mitigations

### Risk: Behavior drift during extraction

Mitigation:

- Move code in small commits by concern.
- Add unit tests before refactoring each concern.

### Risk: Public API break due to moved exports

Mitigation:

- Keep `src/renderer.ts` compatibility re-export.
- Validate package entrypoint exports in tests.

### Risk: Performance regression from additional object churn

Mitigation:

- Keep frame builder pure but avoid unnecessary allocations in hot loops.
- Benchmark current vs refactored using `examples/performance.ts`.

### Risk: Variant resolver non-determinism

Mitigation:

- Deterministic sort order in downgrade candidates.
- Add explicit tie-break test cases.

## 9. Acceptance Criteria

- All existing tests pass.
- New unit tests for layout/variants/frame/ansi pass.
- `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun test` pass.
- Renderer behavior matches current user-visible semantics.
- `src/renderer.ts` is reduced to a thin surface (or removed if import compatibility is handled elsewhere).

## 10. Suggested Execution Order (Checklist)

1. Add missing tests for current sensitive behavior.
2. Extract `ansi.ts` and `tree.ts`.
3. Extract `layout.ts` + tests.
4. Extract `variants.ts` + tests.
5. Extract `frame.ts` + tests.
6. Extract `loop.ts` and wire `FrameRenderer`.
7. Add `renderer/index.ts` and convert `renderer.ts` to compatibility re-exports.
8. Run full quality gates and fix any regressions.
9. Update README architecture notes if needed.
