import type { TaskSnapshot } from "../types";
import type { TaskTreeInfo } from "./types";

export interface OrderedTreeTask {
  readonly snapshot: TaskSnapshot;
  readonly depth: number;
}

const treeAncestorPrefix = (tree: TaskTreeInfo): string =>
  tree.ancestorHasNextSibling
    .slice(1)
    .map((hasNext) => (hasNext ? "│  " : "   "))
    .join("");

export const renderTreePrefix = (tree: TaskTreeInfo): string => {
  if (tree.depth <= 0) {
    return "";
  }

  const ancestor = treeAncestorPrefix(tree);
  return `${ancestor}${tree.hasNextSibling ? "├─ " : "└─ "}`;
};

export const computeTreeInfo = (
  ordered: ReadonlyArray<OrderedTreeTask>,
): ReadonlyArray<OrderedTreeTask & { readonly tree: TaskTreeInfo }> => {
  const hasNextSiblingByIndex: Array<boolean> = Array.from({ length: ordered.length }, () => false);

  for (let i = 0; i < ordered.length; i++) {
    const depth = ordered[i]!.depth;
    for (let j = i + 1; j < ordered.length; j++) {
      const candidateDepth = ordered[j]!.depth;
      if (candidateDepth < depth) {
        break;
      }
      if (candidateDepth === depth) {
        hasNextSiblingByIndex[i] = true;
        break;
      }
    }
  }

  const ancestorStateByDepth: Array<boolean> = [];

  return ordered.map((entry, index) => {
    const depth = entry.depth;
    ancestorStateByDepth.length = depth;

    const hasChildren =
      index + 1 < ordered.length &&
      ordered[index + 1] !== undefined &&
      ordered[index + 1]!.depth > depth;

    const tree: TaskTreeInfo = {
      depth,
      hasNextSibling: hasNextSiblingByIndex[index] ?? false,
      hasChildren,
      ancestorHasNextSibling: [...ancestorStateByDepth],
    };

    ancestorStateByDepth[depth] = hasNextSiblingByIndex[index] ?? false;

    return {
      ...entry,
      tree,
    };
  });
};
