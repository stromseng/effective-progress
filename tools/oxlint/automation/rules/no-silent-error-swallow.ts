import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];

type Node = {
  [key: string]: unknown;
  type: string;
};

const catchMethods = new Set([
  "catch",
  "catchTag",
  "catchTags",
  "catchReason",
  "catchReasons",
]);

const message =
  "Do not silently swallow Effect errors with Effect.void or Effect.unit. Recover meaningfully, transform the error, or let it propagate.";

const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof value.type === "string";

const nodeArray = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.filter(isNode) : [];

const nodeName = ({ value }: { value: unknown }) =>
  isNode(value) && typeof value.name === "string" ? value.name : undefined;

const voidOrUnitMethods = new Set(["void", "unit"]);

const isEffectMember = ({
  names,
  node,
}: {
  names: Set<string>;
  node: unknown;
}) =>
  isNode(node) &&
  node.type === "MemberExpression" &&
  isNode(node.object) &&
  isNode(node.property) &&
  node.object.type === "Identifier" &&
  nodeName({ value: node.object }) === "Effect" &&
  node.property.type === "Identifier" &&
  names.has(nodeName({ value: node.property }) ?? "");

const isEffectVoidOrUnit = ({ node }: { node: unknown }) =>
  isEffectMember({ names: voidOrUnitMethods, node });

const returnsOnlyVoid = ({ node }: { node: unknown }) => {
  if (
    !isNode(node) ||
    (node.type !== "ArrowFunctionExpression" &&
      node.type !== "FunctionExpression")
  ) {
    return false;
  }

  if (isEffectVoidOrUnit({ node: node.body })) {
    return true;
  }

  if (!isNode(node.body) || node.body.type !== "BlockStatement") {
    return false;
  }

  const statements = nodeArray({ value: node.body.body });

  if (statements.length !== 1) {
    return false;
  }

  const statement = statements[0];

  return (
    statement?.type === "ReturnStatement" &&
    isEffectVoidOrUnit({ node: statement.argument })
  );
};

const rule: Rule = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Do not silently swallow Effect errors; recover, transform, or propagate them.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          !isEffectMember({
            names: catchMethods,
            node: node.callee,
          })
        ) {
          return;
        }

        for (const argument of nodeArray({ value: node.arguments })) {
          if (returnsOnlyVoid({ node: argument })) {
            context.report({
              node,
              message,
            });
          }

          if (!isNode(argument) || argument.type !== "ObjectExpression") {
            continue;
          }

          for (const property of nodeArray({ value: argument.properties })) {
            if (
              property.type === "Property" &&
              returnsOnlyVoid({ node: property.value })
            ) {
              context.report({
                node,
                message,
              });
            }
          }
        }
      },
    };
  },
};

export default rule;
