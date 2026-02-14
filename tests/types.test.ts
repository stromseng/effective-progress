import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { defaultProgressConfig, ProgressConfigSchema } from "../src/types";

const decodeProgressConfig = Schema.decodeUnknownSync(ProgressConfigSchema);

describe("ProgressConfigSchema colors validation", () => {
  test("accepts valid progressbar colors", () => {
    const config: unknown = {
      ...defaultProgressConfig,
      progressbar: {
        ...defaultProgressConfig.progressbar,
        colors: {
          fill: { kind: "named", value: "cyanBright" },
          empty: { kind: "hex", value: "#334155", modifiers: ["dim"] },
          brackets: { kind: "rgb", value: { r: 148, g: 163, b: 184 } },
          percent: { kind: "named", value: "white", modifiers: ["bold"] },
          spinner: { kind: "ansi256", value: 214 },
          done: { kind: "named", value: "greenBright" },
          failed: { kind: "named", value: "redBright", modifiers: ["bold"] },
        },
      },
    };

    expect(() => decodeProgressConfig(config)).not.toThrow();
  });

  test("rejects invalid named color", () => {
    const invalidConfig: unknown = {
      ...defaultProgressConfig,
      progressbar: {
        ...defaultProgressConfig.progressbar,
        colors: {
          ...defaultProgressConfig.progressbar.colors,
          fill: { kind: "named", value: "not-a-color" },
        },
      },
    };

    expect(() => decodeProgressConfig(invalidConfig)).toThrow();
  });

  test("rejects invalid hex color", () => {
    const invalidConfig: unknown = {
      ...defaultProgressConfig,
      progressbar: {
        ...defaultProgressConfig.progressbar,
        colors: {
          ...defaultProgressConfig.progressbar.colors,
          fill: { kind: "hex", value: "00b894" },
        },
      },
    };

    expect(() => decodeProgressConfig(invalidConfig)).toThrow();
  });

  test("rejects out-of-range rgb channel", () => {
    const invalidConfig: unknown = {
      ...defaultProgressConfig,
      progressbar: {
        ...defaultProgressConfig.progressbar,
        colors: {
          ...defaultProgressConfig.progressbar.colors,
          fill: { kind: "rgb", value: { r: 256, g: 184, b: 148 } },
        },
      },
    };

    expect(() => decodeProgressConfig(invalidConfig)).toThrow();
  });

  test("rejects out-of-range ansi256 value", () => {
    const invalidConfig: unknown = {
      ...defaultProgressConfig,
      progressbar: {
        ...defaultProgressConfig.progressbar,
        colors: {
          ...defaultProgressConfig.progressbar.colors,
          fill: { kind: "ansi256", value: -1 },
        },
      },
    };

    expect(() => decodeProgressConfig(invalidConfig)).toThrow();
  });
});
