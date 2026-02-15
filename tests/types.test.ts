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
  test("accepts valid merged progressbar config", () => {
    const config = mergeConfig(defaultProgressBarConfig, {
      barWidth: 40,
      spinnerFrames: [".", "o", "O"],
    });

    expect(() => decodeProgressBarConfig(config)).not.toThrow();
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
