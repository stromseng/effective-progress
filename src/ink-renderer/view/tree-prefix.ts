import type { TaskTreeInfo } from "../snapshot/types";

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
