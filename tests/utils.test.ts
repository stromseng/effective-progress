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
});
