import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { makeProgressRenderStore } from "../src/ink-renderer/store";

const sleep = (millis: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, millis);
  });

describe("progress render store", () => {
  test("coalesces rapid task updates into a single published snapshot", async () => {
    const store = makeProgressRenderStore();
    let notifications = 0;

    store.subscribe(() => {
      notifications += 1;
    });

    const taskId = await Effect.runPromise(
      store.addTask({
        description: "batched-task",
        total: 10,
        transient: false,
      }),
    );

    expect(notifications).toBe(1);

    await Effect.runPromise(store.incrementSucceeded(taskId, 1));
    await Effect.runPromise(store.incrementSucceeded(taskId, 1));
    await Effect.runPromise(store.incrementFailed(taskId, 1));

    expect(notifications).toBe(1);

    await sleep(70);

    expect(notifications).toBe(2);

    const snapshot = store.getSnapshot();
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]?.task.units._tag).toBe("DeterminateTaskUnits");
    if (snapshot.rows[0]?.task.units._tag !== "DeterminateTaskUnits") {
      throw new Error("expected determinate units");
    }

    expect(snapshot.rows[0].task.units.succeeded).toBe(2);
    expect(snapshot.rows[0].task.units.failed).toBe(1);
    expect(snapshot.rows[0].task.units.processed).toBe(3);
  });

  test("flush publishes pending updates immediately", async () => {
    const store = makeProgressRenderStore();
    let notifications = 0;

    store.subscribe(() => {
      notifications += 1;
    });

    const taskId = await Effect.runPromise(
      store.addTask({
        description: "flush-task",
        total: 4,
        transient: false,
      }),
    );

    expect(notifications).toBe(1);

    await Effect.runPromise(store.incrementSucceeded(taskId, 2));

    expect(notifications).toBe(1);

    store.flush();

    expect(notifications).toBe(2);
    const row = store.getSnapshot().rows[0];
    expect(row?.task.units._tag).toBe("DeterminateTaskUnits");
    if (!row || row.task.units._tag !== "DeterminateTaskUnits") {
      throw new Error("expected determinate units");
    }

    expect(row.task.units.processed).toBe(2);
  });
});
