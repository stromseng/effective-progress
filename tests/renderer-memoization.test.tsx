import { expect, onTestFinished, test } from "bun:test";
import { Box, render } from "ink";
import stripAnsi from "strip-ansi";
import { Columns, TaskId, type Column, type ColumnDef } from "../src";
import { ProgressRenderer } from "../src/services/renderer/public-api";
import { toRenderSnapshot } from "../src/services/store/render-snapshot";
import { createMockStdio } from "./helpers/mock-stdio";
import { makeTaskSnapshot, renderRows } from "./helpers/renderer";

const setup = async (definitions: ReadonlyArray<Column>, width = 80) => {
  const tasks = new Map([1, 2].map((id) => [TaskId(id), makeTaskSnapshot({ id: TaskId(id) })]));
  const store = {
    tasks,
    renderOrder: Array.from(tasks.keys(), (id) => ({ id, depth: 0 })),
    columns: new Map(Array.from(tasks.keys(), (id) => [id, definitions])),
  };
  let snapshot = toRenderSnapshot(store);
  const tree = (width: number) => (
    <Box width={width}>
      <ProgressRenderer rows={snapshot.rows} columns={store.columns} />
    </Box>
  );
  const io = createMockStdio({ stdout: { isTTY: true, columns: 80, rows: 24 } });
  const instance = render(tree(width), {
    stdout: io.service.stdout,
    patchConsole: false,
    exitOnCtrlC: false,
    debug: true,
  });
  onTestFinished(() => instance.unmount());
  await instance.waitUntilRenderFlush();
  return {
    store,
    increment: () => {
      const task = tasks.get(TaskId(1))!;
      tasks.set(task.id, {
        ...task,
        units: {
          ...task.units,
          succeeded: task.units.succeeded + 1,
          processed: task.units.processed + 1,
        },
      });
    },
    update: async (nextWidth = width) => {
      snapshot = toRenderSnapshot(store, snapshot);
      io.stdout.clear();
      instance.rerender(tree(nextWidth));
      await instance.waitUntilRenderFlush();
      return { output: stripAnsi(io.stdout.getOutput()), rows: snapshot.rows };
    },
  };
};

test("unchanged rows skip column callbacks while changed rows and definitions update", async () => {
  const calls = new Map<TaskId, number>();
  const column: Column = {
    flexBasis: 10,
    render: ({ task }) => {
      calls.set(task.id, (calls.get(task.id) ?? 0) + 1);
      return `count:${task.units.processed}`;
    },
  };
  const fixture = await setup([column]);
  const before = new Map(calls);
  fixture.increment();
  const { output } = await fixture.update();
  expect(calls.get(TaskId(1))).toBe(before.get(TaskId(1))! + 1);
  expect(calls.get(TaskId(2))).toBe(before.get(TaskId(2)));
  expect(output).toContain("count:2");
  expect(output).toContain("count:1");

  fixture.store.columns.set(TaskId(2), [{ ...column, render: () => "changed" }]);
  expect((await fixture.update()).output).toContain("changed");
});

test("changed shared preparation invalidates unchanged rows", async () => {
  const seen = new Map<TaskId, number>();
  const column: ColumnDef<unknown, number> = {
    flexBasis: 20,
    prepare: (rows) => rows.reduce((sum, row) => sum + row.task.units.processed, 0),
    render: ({ task }, { prepared }) => {
      seen.set(task.id, prepared);
      return `sum:${prepared}`;
    },
  };
  const fixture = await setup([column]);
  fixture.increment();
  await fixture.update();
  expect(seen.get(TaskId(1))).toBe(3);
  expect(seen.get(TaskId(2))).toBe(3);
});

test("measured width changes reach memoized cells", async () => {
  const widths = new Map<TaskId, number | undefined>();
  const column: Column = {
    flexBasis: 60,
    flexShrink: 1,
    render: ({ task }, { width }) => {
      widths.set(task.id, width);
      return "x".repeat(60);
    },
  };
  const fixture = await setup([column], 40);
  expect(widths.get(TaskId(1))).toBe(40);
  await fixture.update(20);
  expect(widths.get(TaskId(1))).toBe(20);
  expect(widths.get(TaskId(2))).toBe(20);
});

test("amount cells keep shared alignment when another row crosses a digit boundary", async () => {
  const definitions = [Columns.amount()];
  const fixture = await setup(definitions);
  const task = fixture.store.tasks.get(TaskId(1))!;
  fixture.store.tasks.set(task.id, {
    ...task,
    units: { succeeded: 9, failed: 0, processed: 9, total: 9 },
  });
  await fixture.update();
  fixture.increment();
  const { output, rows } = await fixture.update();
  const expected = renderRows(rows, { columns: fixture.store.columns });
  expect(output).toContain(expected);
});
