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
