import { describe, expect, test } from "bun:test";
import { fitRenderedText, stripAnsi, visibleWidth } from "../src/renderer/ansi";

describe("renderer ansi helpers", () => {
  test("stripAnsi removes escape sequences", () => {
    expect(stripAnsi("\x1b[31mhello\x1b[0m")).toBe("hello");
  });

  test("visibleWidth ignores ansi and counts visible code points", () => {
    expect(visibleWidth("\x1b[32mabc\x1b[0m")).toBe(3);
    expect(visibleWidth("a🙂b")).toBe(3);
  });

  test("fitRenderedText strips ansi in non-tty mode", () => {
    expect(fitRenderedText("\x1b[31mhello\x1b[0m", 4, "truncate", false)).toBe("hell");
  });

  test("fitRenderedText preserves ansi and closes styles in tty mode", () => {
    const rendered = fitRenderedText("\x1b[31mhello", 3, "ellipsis", true);

    expect(visibleWidth(rendered)).toBe(3);
    expect(rendered.includes("\x1b[31m")).toBeTrue();
    expect(rendered.endsWith("\x1b[0m")).toBeTrue();
  });
});
