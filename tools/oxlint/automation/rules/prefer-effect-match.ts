import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];

type Node = {
  [key: string]: unknown;
  range: [number, number];
  type: string;
};

const equalityOperators = new Set(["==", "===", "!=", "!=="]);

const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof value.type === "string" &&
  "range" in value &&
  Array.isArray(value.range);

const isLiteral = (node: unknown) =>
  isNode(node) &&
  (node.type === "Literal" ||
    (node.type === "TemplateLiteral" &&
      Array.isArray(node.expressions) &&
      node.expressions.length === 0));

const getComparedValue = ({
  node,
  getText,
}: {
  node: unknown;
  getText: (node: Node) => string;
}) => {
  if (
    !isNode(node) ||
    node.type !== "BinaryExpression" ||
    typeof node.operator !== "string" ||
    !equalityOperators.has(node.operator)
  ) {
    return undefined;
  }

  if (isLiteral(node.left) && isNode(node.right)) {
    return getText(node.right);
  }

  if (isNode(node.left) && isLiteral(node.right)) {
    return getText(node.left);
  }

  return undefined;
};

const rule: Rule = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Use Match from effect for chained literal ternaries over the same value.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const getText = (node: Node) => sourceCode.getText(node);

    return {
      ConditionalExpression(node) {
        if (node.parent?.type === "ConditionalExpression") {
          return;
        }

        const comparedValue = getComparedValue({
          node: node.test,
          getText,
        });

        if (comparedValue === undefined) {
          return;
        }

        let alternate = node.alternate;
        let literalChecks = 1;

        while (alternate.type === "ConditionalExpression") {
          const alternateComparedValue = getComparedValue({
            node: alternate.test,
            getText,
          });

          if (alternateComparedValue !== comparedValue) {
            return;
          }

          literalChecks += 1;
          alternate = alternate.alternate;
        }

        if (literalChecks > 1) {
          context.report({
            node,
            message:
              "Use Match from effect instead of a chained literal ternary.",
          });
        }
      },
    };
  },
};

export default rule;
