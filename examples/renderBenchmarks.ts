import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { render } from "ink";
import { createElement } from "react";
import { defaults } from "../src/columns";
import { TaskId, type TaskSnapshot } from "../src/types";
import { NowProvider } from "../src/renderer/context/now-context";
import { SpinnerProvider } from "../src/renderer/context/spinner-context";
import { ProgressTable } from "../src/renderer/progress-table";
import { prepareRows } from "../src/renderer/prepare-rows";

const ROWS = 100;
const FRAMES = 30;
const WARMUP_ROUNDS = 2;
const MEASURED_ROUNDS = 7;

type Scenario = "spinner-all" | "spinner-one" | "now-one" | "task-one";

const measure = async (scenario: Scenario) => {
  let cellCalls = 0;
  const columns = defaults().map((column) => ({
    ...column,
    render: (...args: Parameters<typeof column.render>) => {
      cellCalls++;
      return column.render(...args);
    },
  }));
  const tasks = new Map(
    Array.from({ length: ROWS }, (_, index) => {
      const id = TaskId(index + 1);
      const running = scenario === "spinner-all" || scenario === "task-one" || index === 0;
      const task: TaskSnapshot = {
        id,
        parentId: null,
        description: `task-${index}`,
        status: running ? "running" : "done",
        countDisplay: "detailed",
        transient: false,
        units: { succeeded: 100, failed: 0, processed: 100, total: 999 },
        startedAt: 0,
        completedAt: running ? null : 1_000,
        progressSamples: [
          { timestamp: 0, processed: 0 },
          { timestamp: 1_000, processed: 100 },
        ],
        metadata: undefined,
      };
      return [id, task] as const;
    }),
  );
  const store = {
    tasks,
    renderOrder: Array.from(tasks.keys(), (id) => ({ id, depth: 0 })),
    columns: new Map(Array.from(tasks.keys(), (id) => [id, columns])),
  };
  let snapshot = prepareRows(store);
  let content = createElement(ProgressTable, { rows: snapshot.rows, columns: store.columns });
  const tree = (frame: number) =>
    createElement(NowProvider, {
      active: false,
      nowOverride: scenario === "now-one" ? 1_000 + frame * 1_000 : 1_000,
      children: createElement(SpinnerProvider, {
        active: false,
        tickOverride: scenario.startsWith("spinner") ? frame : 0,
        children: content,
      }),
    });
  // Ink only needs the TTY fields below; writes deliberately exclude physical terminal latency.
  const stdout = Object.assign(
    new Writable({ write: (_chunk, _encoding, callback) => callback() }),
    { isTTY: true, columns: 120, rows: ROWS + 5 },
  );
  const instance = render(tree(0), {
    // SAFETY: This sink implements the writable and TTY surface consumed by Ink.
    stdout: stdout as NodeJS.WriteStream,
    patchConsole: false,
    exitOnCtrlC: false,
    interactive: true,
    debug: true,
  });
  await instance.waitUntilRenderFlush();
  const samplesMillis: number[] = [];
  const renderCalls: number[] = [];
  let frame = 0;
  for (let round = 0; round < WARMUP_ROUNDS + MEASURED_ROUNDS; round++) {
    const before = cellCalls;
    const started = performance.now();
    for (let iteration = 0; iteration < FRAMES; iteration++) {
      frame++;
      if (scenario === "task-one") {
        const task = tasks.get(TaskId(1))!;
        tasks.set(task.id, {
          ...task,
          units: { ...task.units, succeeded: 100 + frame, processed: 100 + frame },
        });
        snapshot = prepareRows(store, snapshot);
        content = createElement(ProgressTable, { rows: snapshot.rows, columns: store.columns });
      }
      instance.rerender(tree(frame));
      await instance.waitUntilRenderFlush();
    }
    if (round >= WARMUP_ROUNDS) {
      samplesMillis.push(performance.now() - started);
      renderCalls.push(cellCalls - before);
    }
  }
  instance.unmount();
  stdout.destroy();
  assert.equal(snapshot.rows.length, ROWS);
  if (scenario === "task-one") {
    assert.equal(snapshot.rows[0]!.task.units.processed, 100 + frame);
  }
  const sorted = samplesMillis.toSorted((a, b) => a - b);
  return {
    scenario,
    medianMillis: sorted[Math.floor(sorted.length / 2)]!,
    samplesMillis,
    columnRenderCallsPerSample: renderCalls,
  };
};

const results = [];
for (const scenario of ["spinner-all", "spinner-one", "now-one", "task-one"] as const) {
  results.push(await measure(scenario));
}
console.log(
  JSON.stringify(
    {
      runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
      rows: ROWS,
      framesPerSample: FRAMES,
      warmupRounds: WARMUP_ROUNDS,
      measuredRounds: MEASURED_ROUNDS,
      results,
    },
    null,
    2,
  ),
);
