import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];

const standardArrayMethods = new Set(["from", "isArray", "of"]);

const rule: Rule = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Require globalThis.Array when Array is imported from effect.",
    },
  },
  create(context) {
    let arrayImportedFromEffect = false;

    return {
      ImportDeclaration(node) {
        if (
          node.source.value === "effect" &&
          node.specifiers.some(
            (specifier) =>
              specifier.type === "ImportSpecifier" &&
              specifier.imported.type === "Identifier" &&
              specifier.imported.name === "Array" &&
              specifier.local.name === "Array"
          )
        ) {
          arrayImportedFromEffect = true;
        }
      },
      MemberExpression(node) {
        if (!arrayImportedFromEffect) {
          return;
        }

        if (
          node.object.type === "Identifier" &&
          node.object.name === "Array" &&
          node.property.type === "Identifier" &&
          standardArrayMethods.has(node.property.name)
        ) {
          context.report({
            node,
            message:
              "Array is imported from effect in this file. Use globalThis.Array for standard Array static APIs.",
          });
        }
      },
    };
  },
};

export default rule;
