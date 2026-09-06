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

const isNullLiteral = (node: unknown) =>
  isNode(node) && node.type === "Literal" && node.value === null;

const isOptionMemberCall = ({
  name,
  node,
}: {
  name: string;
  node: unknown;
}) => {
  if (!isNode(node) || node.type !== "CallExpression") {
    return false;
  }

  const callee = node.callee;
  const member =
    isNode(callee) && callee.type === "MemberExpression"
      ? callee
      : isNode(callee) && callee.type === "TSInstantiationExpression"
        ? isNode(callee.expression)
          ? callee.expression
          : undefined
        : undefined;

  return (
    isNode(member) &&
    member.type === "MemberExpression" &&
    isNode(member.object) &&
    isNode(member.property) &&
    member.object.type === "Identifier" &&
    member.object.name === "Option" &&
    member.property.type === "Identifier" &&
    member.property.name === name
  );
};

const rule: Rule = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Use Option.fromNullable instead of ternaries that choose between Option.some and Option.none.",
    },
  },
  create(context) {
    return {
      ConditionalExpression(node) {
        if (
          node.test.type !== "BinaryExpression" ||
          (node.test.operator !== "!==" && node.test.operator !== "!=") ||
          (!isNullLiteral(node.test.left) && !isNullLiteral(node.test.right))
        ) {
          return;
        }

        if (
          isOptionMemberCall({ name: "some", node: node.consequent }) &&
          isOptionMemberCall({ name: "none", node: node.alternate })
        ) {
          context.report({
            node,
            message:
              "Use Option.fromNullable instead of a nullable ternary with Option.some and Option.none.",
          });
        }
      },
    };
  },
};

export default rule;
