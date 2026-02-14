import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import {
  applyColorStyle,
  ColorStyleSchema,
  compileProgressBarColors,
  defaultProgressBarColors,
} from "../src/colors";

const decodeColorStyle = Schema.decodeUnknownSync(ColorStyleSchema);

describe("colors", () => {
  test("applyColorStyle supports each style kind", () => {
    const styles = [
      { kind: "named", value: "cyan" },
      { kind: "hex", value: "#00b894" },
      { kind: "rgb", value: { r: 0, g: 184, b: 148 } },
      { kind: "ansi256", value: 214 },
    ] as const;

    for (const style of styles) {
      const decoded = decodeColorStyle(style);
      const output = applyColorStyle(decoded, "text");
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);
    }
  });

  test("applyColorStyle supports modifiers", () => {
    const style = decodeColorStyle({
      kind: "named",
      value: "yellowBright",
      modifiers: ["bold", "underline"],
    });

    const output = applyColorStyle(style, "styled");
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("compileProgressBarColors returns working formatter functions", () => {
    const compiled = compileProgressBarColors(defaultProgressBarColors);
    const checks = [
      compiled.fill("f"),
      compiled.empty("e"),
      compiled.brackets("["),
      compiled.percent("10%"),
      compiled.spinner("-"),
      compiled.done("[done]"),
      compiled.failed("[failed]"),
    ];

    for (const value of checks) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
