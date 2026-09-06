import { describe, expect, test } from "bun:test";
import { getSpinnerTickAtTime } from "../../src/renderer/hooks/use-spinner-clock";

describe("spinner clock", () => {
  test("advances frames from elapsed time instead of callback count", () => {
    expect(getSpinnerTickAtTime(0, 1_000, 1_000, 100)).toBe(0);
    expect(getSpinnerTickAtTime(0, 1_000, 1_099, 100)).toBe(0);
    expect(getSpinnerTickAtTime(0, 1_000, 1_100, 100)).toBe(1);
    expect(getSpinnerTickAtTime(0, 1_000, 1_349, 100)).toBe(3);
  });

  test("catches up when the event loop delays an update", () => {
    expect(getSpinnerTickAtTime(7, 2_000, 2_450, 100)).toBe(11);
  });

  test("continues from the last rendered frame across separate active windows", () => {
    const pausedTick = getSpinnerTickAtTime(0, 0, 360, 100);
    expect(pausedTick).toBe(3);
    expect(getSpinnerTickAtTime(pausedTick, 5_000, 5_299, 100)).toBe(5);
  });
});
