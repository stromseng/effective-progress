import { expect, onTestFinished, test } from "bun:test";
import { render, Text } from "ink";
import stripAnsi from "strip-ansi";
import { useNow, useSpinnerTick, type Column } from "../../src";
import { NowProvider } from "../../src/renderer/context/now-context";
import { SpinnerProvider } from "../../src/renderer/context/spinner-context";
import { ProgressTable } from "../../src/renderer/progress-table";
import { createMockStdio } from "../helpers/mock-stdio";
import { makeRows, makeTaskSnapshot } from "../helpers/renderer";

test("clock hooks update only subscribed cells and can unsubscribe and resume", async () => {
  const calls = { column: 0, spinner: 0, now: 0 };
  const SpinnerCell = ({ active }: { readonly active: boolean }) => {
    calls.spinner++;
    const tick = useSpinnerTick(active);
    return <Text>{`tick:${tick}`}</Text>;
  };
  const ClockCell = ({ active }: { readonly active: boolean }) => {
    calls.now++;
    const now = useNow(active);
    return <Text>{`now:${now}`}</Text>;
  };
  const definitions: ReadonlyArray<Column> = [
    {
      render: () => {
        calls.column++;
        return "static";
      },
    },
    {
      render: ({ task }) => <SpinnerCell active={task.status === "running"} />,
    },
    {
      render: ({ task }) => <ClockCell active={task.status === "running"} />,
    },
  ];
  const task = makeTaskSnapshot();
  const columns = new Map([[task.id, definitions]]);
  let content = <ProgressTable rows={makeRows([task])} columns={columns} />;
  const tree = (tick: number, now: number) => (
    <NowProvider active={false} nowOverride={now}>
      <SpinnerProvider active={false} tickOverride={tick}>
        {content}
      </SpinnerProvider>
    </NowProvider>
  );
  const io = createMockStdio();
  const instance = render(tree(0, 1_000), {
    stdout: io.service.stdout,
    patchConsole: false,
    exitOnCtrlC: false,
    debug: true,
  });
  onTestFinished(() => instance.unmount());
  await instance.waitUntilRenderFlush();
  const initial = { ...calls };
  instance.rerender(tree(1, 1_000));
  await instance.waitUntilRenderFlush();
  expect(calls).toEqual({ ...initial, spinner: initial.spinner + 1 });
  expect(stripAnsi(io.stdout.getOutput())).toContain("tick:1");

  instance.rerender(tree(1, 2_000));
  await instance.waitUntilRenderFlush();
  expect(calls).toEqual({ ...initial, spinner: initial.spinner + 1, now: initial.now + 1 });
  expect(stripAnsi(io.stdout.getOutput())).toContain("now:2000");

  content = (
    <ProgressTable
      rows={makeRows([{ ...task, status: "done", completedAt: 2_000 }])}
      columns={columns}
    />
  );
  instance.rerender(tree(1, 2_000));
  await instance.waitUntilRenderFlush();
  const stopped = { ...calls };
  instance.rerender(tree(2, 3_000));
  await instance.waitUntilRenderFlush();
  expect(calls).toEqual(stopped);

  content = <ProgressTable rows={makeRows([task])} columns={columns} />;
  instance.rerender(tree(2, 3_000));
  await instance.waitUntilRenderFlush();
  const resumed = { ...calls };
  instance.rerender(tree(3, 4_000));
  await instance.waitUntilRenderFlush();
  expect(calls).toEqual({ ...resumed, spinner: resumed.spinner + 1, now: resumed.now + 1 });
});
