import { describe, expect, test } from "bun:test";
import { computeTreeInfo, renderTreePrefix } from "../src/renderer/tree";
import type { TaskSnapshot } from "../src/types";

const mockSnapshot = (id: number): TaskSnapshot => ({ id }) as unknown as TaskSnapshot;

describe("renderer tree helpers", () => {
  test("renderTreePrefix omits root and renders branch prefixes", () => {
    expect(
      renderTreePrefix({
        depth: 0,
        hasChildren: false,
        hasNextSibling: false,
        ancestorHasNextSibling: [],
      }),
    ).toBe("");

    expect(
      renderTreePrefix({
        depth: 2,
        hasChildren: false,
        hasNextSibling: true,
        ancestorHasNextSibling: [true, false],
      }),
    ).toBe("   ├─ ");
  });

  test("computeTreeInfo tracks sibling and ancestor connector state", () => {
    const tree = computeTreeInfo([
      { snapshot: mockSnapshot(1), depth: 0 },
      { snapshot: mockSnapshot(2), depth: 1 },
      { snapshot: mockSnapshot(3), depth: 1 },
      { snapshot: mockSnapshot(4), depth: 2 },
      { snapshot: mockSnapshot(5), depth: 0 },
    ]);

    expect(tree[0]?.tree.hasNextSibling).toBeTrue();
    expect(tree[0]?.tree.hasChildren).toBeTrue();
    expect(tree[1]?.tree.ancestorHasNextSibling).toEqual([true]);
    expect(tree[2]?.tree.hasNextSibling).toBeFalse();
    expect(tree[2]?.tree.hasChildren).toBeTrue();
    expect(tree[3]?.tree.ancestorHasNextSibling).toEqual([true, false]);
  });
});
