import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { makeProgressRenderStore } from "../src/rendererv2/store";

const sleep = (millis: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, millis);
  });

const waitFor = async (
  predicate: () => boolean,
  timeoutMillis: number,
  pollMillis = 10,
): Promise<void> => {
  const deadline = Date.now() + timeoutMillis;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition not met within ${timeoutMillis}ms`);
    }
    await sleep(pollMillis);
  }
};

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

    await waitFor(() => notifications === 2, 250);

    expect(notifications).toBe(2);

    const publication = store.getSnapshot();
    const task = publication.snapshot.tasks.get(taskId);
    expect(publication.snapshot.renderOrder).toHaveLength(1);
    expect(task?.units.total).toBe(10);
    expect(task?.units.succeeded).toBe(2);
    expect(task?.units.failed).toBe(1);
    expect(task?.units.processed).toBe(3);
    expect(publication.events).toHaveLength(3);
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
    const task = store.getSnapshot().snapshot.tasks.get(taskId);
    expect(task?.units.total).toBe(4);
    expect(task?.units.processed).toBe(2);
  });
});
