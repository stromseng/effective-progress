import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { mergeWith } from "es-toolkit/object";
import {
  defaultProgressBarConfig,
  defaultRendererConfig,
  ProgressBarConfigSchema,
  RendererConfigSchema,
} from "../src/types";

const decodeProgressBarConfig = Schema.decodeUnknownSync(ProgressBarConfigSchema);
const decodeRendererConfig = Schema.decodeUnknownSync(RendererConfigSchema);

const mergeConfig = <T extends Record<PropertyKey, any>>(base: T, override: unknown): unknown =>
  mergeWith(
    structuredClone(base),
    (override ?? {}) as Record<PropertyKey, any>,
    (_targetValue, sourceValue) => {
      if (Array.isArray(sourceValue)) {
        return sourceValue;
      }
      return undefined;
    },
  );

describe("ProgressBarConfigSchema merge + validation", () => {
  test("accepts valid merged progressbar colors", () => {
    const config = mergeConfig(defaultProgressBarConfig, {
      colors: {
        fill: { kind: "named", value: "cyanBright" },
        empty: { kind: "hex", value: "#334155", modifiers: ["dim"] },
        brackets: { kind: "rgb", value: { r: 148, g: 163, b: 184 } },
        percent: { kind: "named", value: "white", modifiers: ["bold"] },
        spinner: { kind: "ansi256", value: 214 },
        done: { kind: "named", value: "greenBright" },
        failed: { kind: "named", value: "redBright", modifiers: ["bold"] },
      },
    });

    expect(() => decodeProgressBarConfig(config)).not.toThrow();
  });

  test("rejects invalid named color after merge", () => {
    const config = mergeConfig(defaultProgressBarConfig, {
      colors: {
        fill: { kind: "named", value: "not-a-color" },
      },
    });

    expect(() => decodeProgressBarConfig(config)).toThrow();
  });

  test("rejects invalid hex color after merge", () => {
    const config = mergeConfig(defaultProgressBarConfig, {
      colors: {
        fill: { kind: "hex", value: "00b894" },
      },
    });

    expect(() => decodeProgressBarConfig(config)).toThrow();
  });

  test("rejects out-of-range rgb channel after merge", () => {
    const config = mergeConfig(defaultProgressBarConfig, {
      colors: {
        fill: { kind: "rgb", value: { r: 256, g: 184, b: 148 } },
      },
    });

    expect(() => decodeProgressBarConfig(config)).toThrow();
  });

  test("rejects out-of-range ansi256 value after merge", () => {
    const config = mergeConfig(defaultProgressBarConfig, {
      colors: {
        fill: { kind: "ansi256", value: -1 },
      },
    });

    expect(() => decodeProgressBarConfig(config)).toThrow();
  });
});

describe("RendererConfigSchema merge + validation", () => {
  test("accepts valid partial override after merge", () => {
    const config = mergeConfig(defaultRendererConfig, {
      renderIntervalMillis: 25,
      maxLogLines: 10,
    });

    expect(() => decodeRendererConfig(config)).not.toThrow();
  });

  test("rejects invalid type after merge", () => {
    const config = mergeConfig(defaultRendererConfig, {
      renderIntervalMillis: "fast",
    });

    expect(() => decodeRendererConfig(config)).toThrow();
  });
});
