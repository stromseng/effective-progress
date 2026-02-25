import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { mergeWith } from "es-toolkit/object";
import {
  Columns,
  decodeRendererConfigSync,
  defaultProgressBarConfig,
  defaultRendererConfig,
  ProgressBarConfigSchema,
} from "../src";

const decodeProgressBarConfig = Schema.decodeUnknownSync(ProgressBarConfigSchema);

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
      columns: Columns.defaults(),
      width: 72,
    });

    expect(() => decodeRendererConfigSync(config)).not.toThrow();
  });

  test("accepts fullwidth renderer width", () => {
    const config = mergeConfig(defaultRendererConfig, {
      columns: Columns.defaults(),
      width: "fullwidth",
    });

    expect(() => decodeRendererConfigSync(config)).not.toThrow();
  });

  test("rejects invalid type after merge", () => {
    const config = mergeConfig(defaultRendererConfig, {
      renderIntervalMillis: "fast",
    });

    expect(() => decodeRendererConfigSync(config)).toThrow();
  });

  test("rejects removed determinateTaskLayout field", () => {
    const config = mergeConfig(defaultRendererConfig, {
      columns: Columns.defaults(),
      determinateTaskLayout: "two-lines",
    });

    expect(() => decodeRendererConfigSync(config)).toThrow();
  });

  test("rejects removed maxTaskWidth field", () => {
    const config = mergeConfig(defaultRendererConfig, {
      columns: Columns.defaults(),
      maxTaskWidth: 120,
    });

    expect(() => decodeRendererConfigSync(config)).toThrow();
  });
});
