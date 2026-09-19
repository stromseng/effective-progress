import { Clock, Effect, Queue } from "effect";
import type { ProgressState } from "./state";

const PUBLISH_INTERVAL_MILLIS = 100;

/** Publishes the latest progress state to the renderer at most every 100ms, with a synchronous shutdown flush. */
export const createStatePublisher = (
  initialState: ProgressState,
  publishQueue: Queue.Queue<void>,
) => {
  let pendingState = initialState;
  let publishedState = pendingState;
  let hasPendingPublish = false;
  let lastPublishAt = -PUBLISH_INTERVAL_MILLIS;
  let latestObservedAt = 0;
  const listeners = new Set<() => void>();

  const notifyListeners = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const publishNow = (publishedAt: number): void => {
    hasPendingPublish = false;
    publishedState = pendingState;
    notifyListeners();
    lastPublishAt = publishedAt;
  };

  const publisherLoop = Effect.forever(
    Effect.gen(function* () {
      yield* Queue.take(publishQueue);

      const now = yield* Clock.currentTimeMillis;
      const waitMillis = Math.max(0, PUBLISH_INTERVAL_MILLIS - (now - lastPublishAt));
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
    const waitMillis = Math.max(0, PUBLISH_INTERVAL_MILLIS - (now - lastPublishAt));
    if (waitMillis === 0) {
      publishNow(now);
      return;
    }

    yield* Queue.offer(publishQueue, undefined);
  });

  return {
    getPublishedState: () => publishedState,
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
    publish: (state: ProgressState, now: number): Effect.Effect<void> => {
      pendingState = state;
      latestObservedAt = now;
      hasPendingPublish = true;
      return schedulePublish;
    },
    publisherLoop,
  };
};
