import { Clock, Effect, Queue } from "effect";
import type { TaskStore } from "../../types";

const SNAPSHOT_PUBLISH_INTERVAL_MILLIS = 100;

/** Publishes the latest state at most every 100ms, with a synchronous shutdown flush. */
export const createSnapshotPublisher = (
  initialSnapshot: TaskStore,
  publishQueue: Queue.Queue<void>,
) => {
  let pendingSnapshot = initialSnapshot;
  let publishedSnapshot = pendingSnapshot;
  let hasPendingPublish = false;
  let lastPublishAt = -SNAPSHOT_PUBLISH_INTERVAL_MILLIS;
  let latestObservedAt = 0;
  const listeners = new Set<() => void>();

  const notifyListeners = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const publishNow = (publishedAt: number): void => {
    hasPendingPublish = false;
    publishedSnapshot = pendingSnapshot;
    notifyListeners();
    lastPublishAt = publishedAt;
  };

  const publisherLoop = Effect.forever(
    Effect.gen(function* () {
      yield* Queue.take(publishQueue);

      const now = yield* Clock.currentTimeMillis;
      const waitMillis = Math.max(0, SNAPSHOT_PUBLISH_INTERVAL_MILLIS - (now - lastPublishAt));
      if (waitMillis > 0) {
        yield* Effect.sleep(waitMillis);
      }
      if (!hasPendingPublish) {
        return;
      }

      const publishAt = yield* Clock.currentTimeMillis;
      publishNow(publishAt);
    }),
  );

  const schedulePublish: Effect.Effect<void> = Effect.gen(function* () {
    if (!hasPendingPublish) {
      return;
    }

    const now = yield* Clock.currentTimeMillis;
    const waitMillis = Math.max(0, SNAPSHOT_PUBLISH_INTERVAL_MILLIS - (now - lastPublishAt));
    if (waitMillis === 0) {
      publishNow(now);
      return;
    }

    yield* Queue.offer(publishQueue, undefined);
  });

  return {
    getPublishedSnapshot: () => publishedSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush: () => {
      if (hasPendingPublish) {
        publishNow(latestObservedAt);
      }
    },
    publish: (snapshot: TaskStore, now: number): Effect.Effect<void> => {
      pendingSnapshot = snapshot;
      latestObservedAt = now;
      hasPendingPublish = true;
      return schedulePublish;
    },
    publisherLoop,
  };
};
