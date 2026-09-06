import { describe, expect, test } from "bun:test";
import { Effect, Option } from "effect";
import { TestClock } from "effect/testing";
import type { ColumnDef } from "../../src";
import { makeProgressStore } from "../../src/services/store/store";

describe("progress store state and publication", () => {
  test.each([[NaN], [Infinity], [-Infinity]] as const)(
    "clears non-finite total %s on creation",
    async (total) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* makeProgressStore;
          const taskId = yield* store.addTask({ description: "non-finite", total });
          const task = Option.getOrThrow(yield* store.getTask(taskId));

          expect(task.units.total).toBeUndefined();
          expect(task.units.processed).toBe(0);
        }).pipe(Effect.scoped),
      );
    },
  );

  test.each([[NaN], [Infinity], [-Infinity]] as const)(
    "clears non-finite total %s on update",
    async (total) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* makeProgressStore;
          const taskId = yield* store.addTask({ description: "non-finite", total: 5 });
          yield* store.incrementSucceeded(taskId, 2);
          yield* store.incrementFailed(taskId);
          yield* store.updateTask(taskId, { total });
          const task = Option.getOrThrow(yield* store.getTask(taskId));

          expect(task.units.total).toBeUndefined();
          expect(task.units).toMatchObject({ succeeded: 2, failed: 1, processed: 3 });
        }).pipe(Effect.scoped),
      );
    },
  );

  test("stops pending publications when the store scope closes", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        let notifications = 0;
        const store = yield* Effect.gen(function* () {
          const store = yield* makeProgressStore;
          store.subscribe(() => {
            notifications += 1;
          });
          const taskId = yield* store.addTask({ description: "scoped", total: 2 });
          yield* store.incrementSucceeded(taskId);
          yield* TestClock.adjust(0);
          expect(notifications).toBe(1);
          return store;
        }).pipe(Effect.scoped);

        const publication = store.getPublishedSnapshot();
        yield* TestClock.adjust(1_000);
        expect(notifications).toBe(1);
        expect(store.getPublishedSnapshot()).toBe(publication);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });

  test("coalesces rapid task updates into a single published snapshot", async () => {
    let notifications = 0;

    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeProgressStore;
        store.subscribe(() => {
          notifications += 1;
        });

        const taskId = yield* store.addTask({
          description: "batched-task",
          total: 10,
          transient: false,
        });

        expect(notifications).toBe(1);
        const initialSnapshot = store.getPublishedSnapshot();
        expect(store.getPublishedSnapshot()).toBe(initialSnapshot);

        yield* store.incrementSucceeded(taskId, 1);
        yield* store.incrementSucceeded(taskId, 1);
        yield* store.incrementFailed(taskId, 1);

        expect(notifications).toBe(1);

        expect(Option.getOrThrow(yield* store.getTask(taskId)).units.processed).toBe(3);

        yield* TestClock.adjust(99);
        expect(notifications).toBe(1);
        expect(store.getPublishedSnapshot()).toBe(initialSnapshot);
        expect(initialSnapshot.tasks.get(taskId)?.units.processed).toBe(0);

        yield* TestClock.adjust(1);
        expect(notifications).toBe(2);

        const publication = store.getPublishedSnapshot();
        expect(publication).not.toBe(initialSnapshot);
        const task = publication.tasks.get(taskId);
        expect(publication.renderOrder).toHaveLength(1);
        expect(task?.units.total).toBe(10);
        expect(task?.units.succeeded).toBe(2);
        expect(task?.units.failed).toBe(1);
        expect(task?.units.processed).toBe(3);
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  test("flush publishes pending updates immediately", async () => {
    let notifications = 0;

    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeProgressStore;
        store.subscribe(() => {
          notifications += 1;
        });

        const taskId = yield* store.addTask({
          description: "flush-task",
          total: 4,
          transient: false,
        });

        expect(notifications).toBe(1);

        yield* store.incrementSucceeded(taskId, 2);

        expect(notifications).toBe(1);

        store.flush();

        expect(notifications).toBe(2);
        const task = store.getPublishedSnapshot().tasks.get(taskId);
        expect(task?.units.total).toBe(4);
        expect(task?.units.processed).toBe(2);

        yield* TestClock.adjust(100);
        expect(notifications).toBe(2);
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  test("keeps nested tasks in depth-first render order", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeProgressStore;

        const parentId = yield* store.addTask({ description: "parent" });
        const childId = yield* store.addTask({ description: "child", parentId });
        const grandchildId = yield* store.addTask({ description: "grandchild", parentId: childId });
        const siblingId = yield* store.addTask({ description: "sibling", parentId });
        const rootSiblingId = yield* store.addTask({ description: "root-sibling" });

        store.flush();

        expect(store.getPublishedSnapshot().renderOrder).toEqual([
          { id: parentId, depth: 0 },
          { id: childId, depth: 1 },
          { id: grandchildId, depth: 2 },
          { id: siblingId, depth: 1 },
          { id: rootSiblingId, depth: 0 },
        ]);
      }).pipe(Effect.scoped),
    );
  });

  test("removes transient subtrees from tasks, render order, and columns", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeProgressStore;
        const columns: ReadonlyArray<ColumnDef<unknown, void>> = [{ render: () => "custom" }];

        const parentId = yield* store.addTask({
          description: "parent",
          transient: true,
          columns,
        });
        const childId = yield* store.addTask({
          description: "child",
          parentId,
          columns,
        });
        yield* store.addTask({
          description: "grandchild",
          parentId: childId,
          columns,
        });
        store.flush();
        const beforeRemoval = store.getPublishedSnapshot();
        const originalTaskIds = [...beforeRemoval.tasks.keys()];
        const originalOrder = [...beforeRemoval.renderOrder];
        const originalColumns = [...beforeRemoval.columns.entries()];

        yield* store.completeTask(parentId);
        store.flush();

        const publication = store.getPublishedSnapshot();
        expect(publication.tasks.size).toBe(0);
        expect(publication.renderOrder).toEqual([]);
        expect(publication.columns.size).toBe(0);
        expect([...beforeRemoval.tasks.keys()]).toEqual(originalTaskIds);
        expect(beforeRemoval.renderOrder).toEqual(originalOrder);
        expect([...beforeRemoval.columns.entries()]).toEqual(originalColumns);
      }).pipe(Effect.scoped),
    );
  });

  test.each(["completeTask", "failTask"] as const)(
    "%s removes a nested transient subtree without removing its neighbors",
    async (finalize) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* makeProgressStore;
          const columns: ReadonlyArray<ColumnDef<unknown>> = [{ render: () => "custom" }];
          const rootId = yield* store.addTask({ description: "root", columns });
          const leftId = yield* store.addTask({ description: "left", parentId: rootId, columns });
          const branchId = yield* store.addTask({
            description: "branch",
            parentId: rootId,
            transient: true,
            columns,
          });
          yield* store.addTask({ description: "leaf", parentId: branchId, columns });
          const rightId = yield* store.addTask({ description: "right", parentId: rootId, columns });
          const rootSiblingId = yield* store.addTask({ description: "root sibling", columns });

          yield* store[finalize](branchId);
          store.flush();

          const snapshot = store.getPublishedSnapshot();
          const survivingIds = [rootId, leftId, rightId, rootSiblingId];
          expect([...snapshot.tasks.keys()]).toEqual(survivingIds);
          expect([...snapshot.columns.keys()]).toEqual(survivingIds);
          expect(snapshot.renderOrder).toEqual([
            { id: rootId, depth: 0 },
            { id: leftId, depth: 1 },
            { id: rightId, depth: 1 },
            { id: rootSiblingId, depth: 0 },
          ]);
        }).pipe(Effect.scoped),
      );
    },
  );

  test("does not republish already-finalized tasks", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeProgressStore;
        let notifications = 0;
        store.subscribe(() => {
          notifications += 1;
        });

        const completedId = yield* store.addTask({ description: "completed", transient: false });
        yield* store.completeTask(completedId);
        store.flush();

        expect(store.getPublishedSnapshot().tasks.get(completedId)?.status).toBe("done");
        const afterCompleteNotifications = notifications;

        yield* store.failTask(completedId);
        store.flush();

        expect(notifications).toBe(afterCompleteNotifications);
        expect(store.getPublishedSnapshot().tasks.get(completedId)?.status).toBe("done");

        const failedId = yield* store.addTask({ description: "failed", transient: false });
        store.flush();

        yield* store.failTask(failedId);
        store.flush();

        expect(store.getPublishedSnapshot().tasks.get(failedId)?.status).toBe("failed");
        const afterFailNotifications = notifications;

        yield* store.completeTask(failedId);
        store.flush();

        expect(notifications).toBe(afterFailNotifications);
        expect(store.getPublishedSnapshot().tasks.get(failedId)?.status).toBe("failed");
      }).pipe(Effect.scoped),
    );
  });

  test("unsubscribe stops listener notifications", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeProgressStore;
        let activeNotifications = 0;
        let removedNotifications = 0;

        store.subscribe(() => {
          activeNotifications += 1;
        });
        const unsubscribe = store.subscribe(() => {
          removedNotifications += 1;
        });

        yield* store.addTask({ description: "first" });
        expect(activeNotifications).toBe(1);
        expect(removedNotifications).toBe(1);

        unsubscribe();

        yield* store.addTask({ description: "second" });
        store.flush();

        expect(activeNotifications).toBe(2);
        expect(removedNotifications).toBe(1);
      }).pipe(Effect.scoped),
    );
  });

  test("records progress samples only when processed changes", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeProgressStore;
        const taskId = yield* store.addTask({ description: "sampled" });

        yield* store.updateTask(taskId, { description: "renamed" });
        yield* store.incrementSucceeded(taskId, 0);

        const task = yield* store.getTask(taskId);
        expect(Option.isSome(task)).toBeTrue();
        expect(Option.isSome(task) ? task.value.progressSamples : []).toEqual([
          { timestamp: 0, processed: 0 },
        ]);
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  test("caps progress samples and keeps the latest processed observations", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeProgressStore;
        const taskId = yield* store.addTask({ description: "sample-cap" });

        for (let i = 0; i < 1_005; i++) {
          yield* store.incrementSucceeded(taskId, 1);
        }

        const task = yield* store.getTask(taskId);
        expect(Option.isSome(task)).toBeTrue();
        if (Option.isNone(task)) {
          return;
        }

        const samples = task.value.progressSamples;
        expect(samples).toHaveLength(1_000);
        expect(samples[0]).toEqual({ timestamp: 0, processed: 6 });
        expect(samples.at(-1)).toEqual({ timestamp: 0, processed: 1_005 });
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  test("retains one ETA sample before the rolling window", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeProgressStore;
        const taskId = yield* store.addTask({ description: "sample-window" });

        yield* TestClock.adjust(1_000);
        yield* store.incrementSucceeded(taskId, 1);
        yield* TestClock.adjust(1_000);
        yield* store.incrementSucceeded(taskId, 1);
        yield* TestClock.adjust(31_000);
        yield* store.incrementSucceeded(taskId, 1);

        const task = yield* store.getTask(taskId);
        expect(Option.isSome(task)).toBeTrue();
        if (Option.isNone(task)) {
          return;
        }

        expect(task.value.progressSamples).toEqual([
          { timestamp: 2_000, processed: 2 },
          { timestamp: 33_000, processed: 3 },
        ]);
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });
});
