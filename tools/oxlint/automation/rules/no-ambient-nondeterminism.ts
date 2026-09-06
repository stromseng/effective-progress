import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type VisitorObject = ReturnType<NonNullable<Rule["create"]>>;
type MemberExpressionNode = Parameters<
  NonNullable<VisitorObject["MemberExpression"]>
>[0];
type IdentifierNode = Parameters<NonNullable<VisitorObject["Identifier"]>>[0];

interface Options {
  readonly allowedDateBasenames?: ReadonlyArray<string>;
  readonly allowedDateExtensions?: ReadonlyArray<string>;
}

const _memberPropertyName = ({ node }: { node: MemberExpressionNode }) =>
  node.property.type === "Identifier"
    ? node.property.name
    : node.property.type === "Literal" &&
        typeof node.property.value === "string"
      ? node.property.value
      : undefined;

const rule: Rule = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Disallow ambient randomness and time in favor of Effect capabilities.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowedDateBasenames: {
            type: "array",
            items: { type: "string" },
          },
          allowedDateExtensions: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = (context.options[0] ?? {}) as Options;
    const allowedDateBasenames = new Set(options.allowedDateBasenames ?? []);
    const allowedDateExtensions = options.allowedDateExtensions ?? [".tsx"];
    const filename = (context.filename ?? "").replaceAll("\\", "/");
    const basename = filename.slice(filename.lastIndexOf("/") + 1);
    const allowAmbientDate =
      allowedDateExtensions.some((extension) => filename.endsWith(extension)) ||
      allowedDateBasenames.has(basename);

    const isGlobalIdentifier = ({
      name,
      node,
    }: {
      name: string;
      node: IdentifierNode;
    }) => {
      if (node.name !== name) {
        return false;
      }

      let scope: ReturnType<typeof context.sourceCode.getScope> | null =
        context.sourceCode.getScope(node);

      while (scope !== null) {
        const variable = scope.set.get(name);

        if (variable !== undefined) {
          return variable.defs.length === 0;
        }

        scope = scope.upper;
      }

      return true;
    };

    const isGlobalThisMember = ({
      name,
      node,
    }: {
      name: string;
      node: MemberExpressionNode;
    }) =>
      node.object.type === "Identifier" &&
      isGlobalIdentifier({ name: "globalThis", node: node.object }) &&
      _memberPropertyName({ node }) === name;

    const isGlobalObject = ({
      name,
      node,
    }: {
      name: string;
      node: MemberExpressionNode["object"];
    }) =>
      (node.type === "Identifier" &&
        isGlobalIdentifier({
          name,
          node,
        })) ||
      (node.type === "MemberExpression" &&
        isGlobalThisMember({
          name,
          node,
        }));

    return {
      CallExpression(node) {
        if (
          allowAmbientDate ||
          node.arguments.length !== 0 ||
          node.callee.type !== "Identifier" ||
          !isGlobalIdentifier({ name: "Date", node: node.callee })
        ) {
          return;
        }

        context.report({
          node,
          message:
            "Do not read the current time from ambient Date. Use Effect Clock or DateTime capabilities.",
        });
      },
      Identifier(node) {
        if (
          node.parent?.type === "MemberExpression" &&
          node.parent.property === node &&
          node.parent.computed !== true
        ) {
          return;
        }

        if (!isGlobalIdentifier({ name: "crypto", node })) {
          return;
        }

        context.report({
          node,
          message:
            "Do not use ambient crypto. Use Effect's Crypto capability instead.",
        });
      },
      MemberExpression(node) {
        const propertyName = _memberPropertyName({ node });

        if (isGlobalThisMember({ name: "crypto", node })) {
          context.report({
            node,
            message:
              "Do not use ambient crypto. Use Effect's Crypto capability instead.",
          });
          return;
        }

        if (
          propertyName === "random" &&
          isGlobalObject({ name: "Math", node: node.object })
        ) {
          context.report({
            node,
            message:
              "Do not use ambient Math.random. Use Effect's Random capability instead.",
          });
          return;
        }

        if (
          !allowAmbientDate &&
          propertyName === "now" &&
          isGlobalObject({ name: "Date", node: node.object })
        ) {
          context.report({
            node,
            message:
              "Do not read the current time from ambient Date. Use Effect Clock or DateTime capabilities.",
          });
        }
      },
      NewExpression(node) {
        if (
          allowAmbientDate ||
          node.arguments.length !== 0 ||
          node.callee.type !== "Identifier" ||
          !isGlobalIdentifier({ name: "Date", node: node.callee })
        ) {
          return;
        }

        context.report({
          node,
          message:
            "Do not read the current time from ambient Date. Use Effect Clock or DateTime capabilities.",
        });
      },
    };
  },
};

export default rule;
