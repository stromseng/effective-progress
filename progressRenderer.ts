import { Deferred, Effect, Queue } from "effect";
import { decodeProgressEvent } from "./progressConsole";
import type { DelegateEvent, ProgressEvent } from "./progressConsole";

const MAX_LOG_LINES = 8;
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";
const MOVE_UP_ONE = "\x1b[1A";

const renderBar = (completed: number, total: number) => {
  const width = 30;
  const safeTotal = total <= 0 ? 1 : total;
  const ratio = Math.min(1, Math.max(0, completed / safeTotal));
  const filled = Math.round(ratio * width);
  const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
  const percent = String(Math.round(ratio * 100)).padStart(3, " ");
  return `[${bar}] ${completed}/${total} ${percent}%`;
};

export const runProgressRenderer = (queue: Queue.Queue<ProgressEvent>, total: number) =>
  Effect.gen(function* () {
    const isTTY = Boolean(process.stderr.isTTY);
    const state = {
      total,
      completed: 0,
      logs: [] as Array<string>,
      dirty: true,
    };

    let previousLineCount = 0;
    const ttyProgressStep = Math.max(1, Math.floor(total / 20));

    const clearTTY = () => {
      let output = "\r" + CLEAR_LINE;
      for (let i = 1; i < previousLineCount; i++) {
        output += MOVE_UP_ONE + CLEAR_LINE;
      }
      process.stderr.write(output + "\r");
      previousLineCount = 0;
    };

    const renderTTY = () => {
      const lines = [...state.logs, renderBar(state.completed, state.total)];

      let output = "\r" + CLEAR_LINE;
      for (let i = 1; i < previousLineCount; i++) {
        output += MOVE_UP_ONE + CLEAR_LINE;
      }
      output += lines.join("\n");

      process.stderr.write(output);
      previousLineCount = lines.length;
      state.dirty = false;
    };

    if (isTTY) {
      process.stderr.write(HIDE_CURSOR);
      renderTTY();
    }

    let done = false;
    while (!done) {
      const event = decodeProgressEvent(yield* Queue.take(queue));
      const rest = yield* Queue.takeAll(queue);
      const batchedEvents = [event, ...Array.from(rest, (next) => decodeProgressEvent(next))];

      for (const current of batchedEvents) {
        switch (current._tag) {
          case "Log": {
            if (isTTY) {
              state.logs.push(current.message);
              if (state.logs.length > MAX_LOG_LINES) {
                state.logs.shift();
              }
              state.dirty = true;
            } else {
              process.stderr.write(current.message + "\n");
            }
            break;
          }
          case "Increment": {
            state.completed = Math.min(state.total, state.completed + current.amount);
            if (isTTY) {
              state.dirty = true;
            } else if (state.completed === state.total || state.completed % ttyProgressStep === 0) {
              process.stderr.write(`Progress: ${state.completed}/${state.total}\n`);
            }
            break;
          }
          case "Stop": {
            done = true;
            break;
          }
          case "Delegate": {
            const delegateEvent = current as DelegateEvent;
            if (isTTY) {
              clearTTY();
            }

            yield* delegateEvent.effect;
            if (delegateEvent.ack) {
              yield* Deferred.succeed(delegateEvent.ack, undefined);
            }

            if (isTTY) {
              state.dirty = true;
            }
            break;
          }
        }
      }

      if (isTTY && state.dirty) {
        renderTTY();
      }
    }

    if (isTTY) {
      process.stderr.write("\n" + SHOW_CURSOR);
    }
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        if (process.stderr.isTTY) {
          process.stderr.write(SHOW_CURSOR);
        }
      }),
    ),
  );
