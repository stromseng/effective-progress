import { describe, expect, test } from "bun:test";
import { render, Text } from "ink";
import { createElement } from "react";
import * as Progress from "../src";
import { NowProvider, useNow } from "../src/renderer/context/now-context";
import {
  CreateProgressRenderer,
  type ProgressColumnDefinition,
  type ProgressColumnMeasurement,
  type ProgressColumnProps,
} from "../src/renderer/public-api";
import type { TaskRowModel } from "../src/renderer/store/types";
import { createMockStdio } from "./helpers/mock-stdio";

const deriveRow = (task: Progress.TaskSnapshot): TaskRowModel => ({
  task,
  tree: {
    depth: 0,
    hasChildren: false,
    hasNextSibling: false,
    ancestorHasNextSibling: [],
  },
  derived: {
    treePrefix: "",
    treePrefixWidth: 0,
    descriptionWidth: task.description.length,
    treePrefixedDescriptionWidth: task.description.length,
    hasRenderableProgress: task.units.total !== undefined || task.units.processed > 0,
    isDeterminate: task.units.total !== undefined,
  },
});

const makeTask = (): Progress.TaskSnapshot =>
  Progress.TaskSnapshot({
    id: Progress.TaskId(1),
    parentId: null,
    description: "row",
    status: "running",
    countDisplay: "processedOnly",
    transient: false,
    units: {
      succeeded: 1,
      failed: 0,
      processed: 1,
      total: 2,
    },
    startedAt: 0,
    completedAt: null,
  });

const fixedMeasurement = (width: number): ProgressColumnMeasurement => ({
  minWidth: width,
  preferredWidth: width,
  maxWidth: width,
});

describe("rendererv2 public api", () => {
  test("does not rerender static cells when only now changes", () => {
    let staticRenderCount = 0;
    let dynamicRenderCount = 0;

    const staticColumn: ProgressColumnDefinition = {
      Component: ({ row }: ProgressColumnProps) => {
        staticRenderCount += 1;
        return <Text>{row.task.description}</Text>;
      },
      measure: () => fixedMeasurement(6),
      sticky: false,
    };

    const dynamicColumn: ProgressColumnDefinition = {
      Component: () => {
        dynamicRenderCount += 1;
        const now = useNow();
        return <Text>{`${now}`}</Text>;
      },
      measure: () => fixedMeasurement(5),
      sticky: false,
    };

    const Renderer = CreateProgressRenderer([staticColumn, dynamicColumn]);
    const stdio = createMockStdio({
      stdout: { isTTY: true, columns: 40, rows: 10 },
      stderr: { isTTY: true, columns: 40, rows: 10 },
    });
    const rows = [deriveRow(makeTask())];

    const instance = render(
      createElement(NowProvider, {
        active: false,
        nowOverride: 1_000,
        children: createElement(Renderer, {
          rows,
          terminalColumns: 40,
          terminalRows: 10,
        }),
      }),
      { stdout: stdio.stdout.stream, stderr: stdio.stderr.stream, debug: false },
    );

    instance.rerender(
      createElement(NowProvider, {
        active: false,
        nowOverride: 2_000,
        children: createElement(Renderer, {
          rows,
          terminalColumns: 40,
          terminalRows: 10,
        }),
      }),
    );
    instance.unmount();

    expect(staticRenderCount).toBe(1);
    expect(dynamicRenderCount).toBe(2);
  });

  test("only recomputes layout when the column layout dependency changes", () => {
    let measureCount = 0;

    const column: ProgressColumnDefinition = {
      Component: () => <Text>value</Text>,
      measure: () => {
        measureCount += 1;
        return fixedMeasurement(5);
      },
      getLayoutDependency: ({ now }) => Math.floor(now / 10_000),
      sticky: false,
    };

    const Renderer = CreateProgressRenderer([column]);
    const stdio = createMockStdio({
      stdout: { isTTY: true, columns: 20, rows: 10 },
      stderr: { isTTY: true, columns: 20, rows: 10 },
    });
    const rows = [deriveRow(makeTask())];

    const instance = render(
      createElement(NowProvider, {
        active: false,
        nowOverride: 1_000,
        children: createElement(Renderer, {
          rows,
          terminalColumns: 20,
          terminalRows: 10,
        }),
      }),
      { stdout: stdio.stdout.stream, stderr: stdio.stderr.stream, debug: false },
    );

    expect(measureCount).toBe(1);

    instance.rerender(
      createElement(NowProvider, {
        active: false,
        nowOverride: 2_000,
        children: createElement(Renderer, {
          rows,
          terminalColumns: 20,
          terminalRows: 10,
        }),
      }),
    );

    expect(measureCount).toBe(1);

    instance.rerender(
      createElement(NowProvider, {
        active: false,
        nowOverride: 11_000,
        children: createElement(Renderer, {
          rows,
          terminalColumns: 20,
          terminalRows: 10,
        }),
      }),
    );
    instance.unmount();

    expect(measureCount).toBe(2);
  });
});
