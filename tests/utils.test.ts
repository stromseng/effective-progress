import { describe, expect, test } from "bun:test";
import { inferTotal } from "../src/utils";

describe("inferTotal", () => {
  test.each([
    ["", 0],
    ["abc", 3],
    ["你好", 2],
    ["a😀", 2],
    ["😀🚀", 2],
    ["e\u0301", 2],
    ["👩‍💻", 3],
  ] as const)("counts string iteration items for %j", (input, expected) => {
    expect(inferTotal(input)).toBe(expected);
  });
  test("reads collection lengths and sizes without consuming the iterable", () => {
    expect(inferTotal([1, 2])).toBe(2);
    expect(inferTotal(new Set([1, 2]))).toBe(2);
    expect(inferTotal(new Map([[1, "one"]]))).toBe(1);

    const iterable = {
      length: "untrusted length",
      size: 2,
      *[Symbol.iterator]() {
        throw new Error("Total inference must not consume custom iterables");
      },
    };
    expect(inferTotal(iterable)).toBe(2);
    const invalidSize = { ...iterable, size: "untrusted size" };
    const withLength = { ...iterable, length: 3 };
    expect(inferTotal(invalidSize)).toBeUndefined();
    expect(inferTotal(withLength)).toBe(3);
  });
});
