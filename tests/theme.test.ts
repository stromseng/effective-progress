import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { Theme } from "../src/theme";

describe("theme", () => {
  test("Theme styles return styled strings", () => {
    const theme = Theme.of({
      styles: {
        plain: (text) => text,
        barFill: chalk.blue,
        barEmpty: chalk.white.dim,
        barBracket: chalk.white.dim,
        spinner: chalk.yellow,
        statusDone: chalk.green,
        statusFailed: chalk.red,
        text: chalk.white,
        units: chalk.cyan,
        eta: chalk.gray,
        elapsed: chalk.gray,
        treeConnector: chalk.gray,
      },
    });

    const checks = [
      theme.styles.barFill("f"),
      theme.styles.barEmpty("e"),
      theme.styles.barBracket("["),
      theme.styles.spinner("-"),
      theme.styles.statusDone("done"),
      theme.styles.statusFailed("failed"),
      theme.styles.text("desc"),
      theme.styles.units("1/2"),
      theme.styles.eta("ETA: 1s"),
      theme.styles.elapsed("1s"),
      theme.styles.treeConnector("├─"),
    ];

    for (const value of checks) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test("depthPalette can override depth-specific styling", () => {
    const theme = Theme.of({
      styles: {
        plain: (text) => text,
        barFill: chalk.blue,
        barEmpty: chalk.white.dim,
        barBracket: chalk.white.dim,
        spinner: chalk.yellow,
        statusDone: chalk.green,
        statusFailed: chalk.red,
        text: chalk.white,
        units: chalk.cyan,
        eta: chalk.gray,
        elapsed: chalk.gray,
        treeConnector: chalk.gray,
      },
      depthPalette: (depth, role) =>
        role === "text" && depth > 0 ? chalk.magentaBright : undefined,
    });

    expect(theme.depthPalette?.(1, "text")?.("child")).toContain("child");
    expect(theme.depthPalette?.(0, "text")).toBeUndefined();
  });
});
