import { describe, expect, test } from "bun:test";
import { Effect, Option, TestClock, TestContext } from "effect";
import type { ColumnDef } from "../src";
import { makeProgressStore } from "../src/services/store/store";

describe("progress render store", () => {
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

        yield* store.incrementSucceeded(taskId, 1);
        yield* store.incrementSucceeded(taskId, 1);
        yield* store.incrementFailed(taskId, 1);

        expect(notifications).toBe(1);

        yield* TestClock.adjust(99);
        expect(notifications).toBe(1);

        yield* TestClock.adjust(1);
        expect(notifications).toBe(2);

        const publication = store.getSnapshot();
        const task = publication.snapshot.tasks.get(taskId);
        expect(publication.snapshot.renderOrder).toHaveLength(1);
        expect(task?.units.total).toBe(10);
        expect(task?.units.succeeded).toBe(2);
        expect(task?.units.failed).toBe(1);
        expect(task?.units.processed).toBe(3);
        expect(publication.events).toHaveLength(3);
      }).pipe(Effect.provide(TestContext.TestContext)),
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
        const task = store.getSnapshot().snapshot.tasks.get(taskId);
        expect(task?.units.total).toBe(4);
        expect(task?.units.processed).toBe(2);

        yield* TestClock.adjust(100);
        expect(notifications).toBe(2);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  test("publishes concrete lifecycle event payloads", async () => {
    const store = await Effect.runPromise(makeProgressStore);

    const taskId = await Effect.runPromise(
      store.addTask({
        description: "event-task",
        total: 5,
        transient: false,
        countDisplay: "processedOnly",
      }),
    );

    const added = store.getSnapshot().events;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      _tag: "TaskAdded",
      taskId,
      parentId: null,
      description: "event-task",
      total: 5,
      transient: false,
      countDisplay: "processedOnly",
    });

    await Effect.runPromise(
      store.updateTask(taskId, {
        description: "event-task-updated",
        succeeded: 1,
        failed: 1,
        total: 6,
        transient: true,
        countDisplay: "detailed",
      }),
    );
    await Effect.runPromise(store.incrementSucceeded(taskId, 2));
    await Effect.runPromise(store.incrementFailed(taskId, 1));
    await Effect.runPromise(store.completeTask(taskId));
    store.flush();

    expect(store.getSnapshot().events).toEqual([
      expect.objectContaining({
        _tag: "TaskUpdated",
        taskId,
        description: "event-task-updated",
        succeeded: 1,
        failed: 1,
        processed: 2,
        total: 6,
        transient: true,
        countDisplay: "detailed",
      }),
      expect.objectContaining({
        _tag: "TaskAdvanced",
        taskId,
        amount: 2,
        kind: "succeeded",
      }),
      expect.objectContaining({
        _tag: "TaskAdvanced",
        taskId,
        amount: 1,
        kind: "failed",
      }),
      expect.objectContaining({
        _tag: "TaskCompleted",
        taskId,
      }),
      expect.objectContaining({
        _tag: "TaskRemoved",
        taskId,
      }),
    ]);
  });

  test("keeps nested tasks in depth-first render order", async () => {
    const store = await Effect.runPromise(makeProgressStore);

    const parentId = await Effect.runPromise(store.addTask({ description: "parent" }));
    const childId = await Effect.runPromise(store.addTask({ description: "child", parentId }));
    const grandchildId = await Effect.runPromise(
      store.addTask({ description: "grandchild", parentId: childId }),
    );
    const siblingId = await Effect.runPromise(store.addTask({ description: "sibling", parentId }));
    const rootSiblingId = await Effect.runPromise(store.addTask({ description: "root-sibling" }));

    store.flush();

    expect(store.getSnapshot().snapshot.renderOrder).toEqual([
      { id: parentId, depth: 0 },
      { id: childId, depth: 1 },
      { id: grandchildId, depth: 2 },
      { id: siblingId, depth: 1 },
      { id: rootSiblingId, depth: 0 },
    ]);
  });

  test("removes transient subtrees from tasks, render order, and columns", async () => {
    const store = await Effect.runPromise(makeProgressStore);
    const columns: ReadonlyArray<ColumnDef<unknown, void>> = [{ render: () => "custom" }];

    const parentId = await Effect.runPromise(
      store.addTask({
        description: "parent",
        transient: true,
        columns,
      }),
    );
    const childId = await Effect.runPromise(
      store.addTask({
        description: "child",
        parentId,
        columns,
      }),
    );
    const grandchildId = await Effect.runPromise(
      store.addTask({
        description: "grandchild",
        parentId: childId,
        columns,
      }),
    );
    store.flush();

    await Effect.runPromise(store.completeTask(parentId));
    store.flush();

    const publication = store.getSnapshot();
    expect(publication.snapshot.tasks.size).toBe(0);
    expect(publication.snapshot.renderOrder).toEqual([]);
    expect(publication.snapshot.columns.size).toBe(0);
    expect(publication.events).toEqual([
      expect.objectContaining({ _tag: "TaskCompleted", taskId: parentId }),
      expect.objectContaining({ _tag: "TaskRemoved", taskId: parentId }),
      expect.objectContaining({ _tag: "TaskRemoved", taskId: childId }),
      expect.objectContaining({ _tag: "TaskRemoved", taskId: grandchildId }),
    ]);
  });

  test("does not publish terminal lifecycle events twice", async () => {
    const store = await Effect.runPromise(makeProgressStore);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    const completedId = await Effect.runPromise(
      store.addTask({ description: "completed", transient: false }),
    );
    await Effect.runPromise(store.completeTask(completedId));
    store.flush();

    expect(store.getSnapshot().events).toEqual([
      expect.objectContaining({ _tag: "TaskCompleted", taskId: completedId }),
    ]);
    const afterCompleteNotifications = notifications;

    await Effect.runPromise(store.failTask(completedId));
    store.flush();

    expect(notifications).toBe(afterCompleteNotifications);
    expect(store.getSnapshot().events).toEqual([
      expect.objectContaining({ _tag: "TaskCompleted", taskId: completedId }),
    ]);

    const failedId = await Effect.runPromise(
      store.addTask({ description: "failed", transient: false }),
    );
    store.flush();

    await Effect.runPromise(store.failTask(failedId));
    store.flush();

    expect(store.getSnapshot().events).toEqual([
      expect.objectContaining({ _tag: "TaskFailed", taskId: failedId }),
    ]);
    const afterFailNotifications = notifications;

    await Effect.runPromise(store.completeTask(failedId));
    store.flush();

    expect(notifications).toBe(afterFailNotifications);
    expect(store.getSnapshot().events).toEqual([
      expect.objectContaining({ _tag: "TaskFailed", taskId: failedId }),
    ]);
  });

  test("unsubscribe stops listener notifications", async () => {
    const store = await Effect.runPromise(makeProgressStore);
    let activeNotifications = 0;
    let removedNotifications = 0;

    store.subscribe(() => {
      activeNotifications += 1;
    });
    const unsubscribe = store.subscribe(() => {
      removedNotifications += 1;
    });

    await Effect.runPromise(store.addTask({ description: "first" }));
    expect(activeNotifications).toBe(1);
    expect(removedNotifications).toBe(1);

    unsubscribe();

    await Effect.runPromise(store.addTask({ description: "second" }));
    store.flush();

    expect(activeNotifications).toBe(2);
    expect(removedNotifications).toBe(1);
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
      }).pipe(Effect.provide(TestContext.TestContext)),
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
      }).pipe(Effect.provide(TestContext.TestContext)),
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
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
