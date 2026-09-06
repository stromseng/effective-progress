import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];

type Node = {
  [key: string]: unknown;
  type: string;
};

const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof value.type === "string";

const rule: Rule = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Keep Effect Schema validation enabled; fix the data or schema instead.",
    },
  },
  create(context) {
    return {
      Property(node) {
        const keyName = isNode(node.key)
          ? node.key.type === "Identifier" ||
            node.key.type === "PrivateIdentifier"
            ? node.key.name
            : node.key.type === "Literal"
              ? node.key.value
              : undefined
          : undefined;
        const value = node.value;

        if (
          keyName === "disableValidation" &&
          isNode(value) &&
          value.type === "Literal" &&
          value.value === true
        ) {
          context.report({
            node,
            message:
              "Do not use disableValidation: true. Fix the data or schema and keep validation enabled.",
          });
        }
      },
    };
  },
};

export default rule;
