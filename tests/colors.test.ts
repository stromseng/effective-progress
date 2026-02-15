import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { Colorizer } from "../src/colors";

describe("colors", () => {
  test("ColorizerService functions return styled strings", () => {
    const colorizer = Colorizer.of({
      fill: chalk.blue,
      empty: chalk.white.dim,
      brackets: chalk.white.dim,
      percent: chalk.white.bold,
      spinner: chalk.yellow,
      done: chalk.green,
      failed: chalk.red,
    });

    const checks = [
      colorizer.fill("f"),
      colorizer.empty("e"),
      colorizer.brackets("["),
      colorizer.percent("10%"),
      colorizer.spinner("-"),
      colorizer.done("[done]"),
      colorizer.failed("[failed]"),
    ];

    for (const value of checks) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test("custom chalk styles work as colorizer functions", () => {
    const colorizer = Colorizer.of({
      fill: chalk.hex("#00b894"),
      empty: chalk.rgb(100, 100, 100),
      brackets: chalk.ansi256(214),
      percent: chalk.whiteBright.bold,
      spinner: chalk.magentaBright,
      done: chalk.greenBright,
      failed: chalk.redBright.bold,
    });

    expect(colorizer.fill("bar")).toContain("bar");
    expect(colorizer.brackets("[")).toContain("[");
  });
});
