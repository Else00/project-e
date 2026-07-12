import { describe, expect, it } from "vitest";
import { formatAspectRatio, formatDecimalRatio, integerAspectRatio } from "./displayFormat";

describe("display formatting", () => {
  it("formats exact display ratios as integer width-height pairs", () => {
    expect(formatAspectRatio(1440, 960)).toBe("3:2");
    expect(formatAspectRatio(1920, 1080)).toBe("16:9");
  });

  it("approximates browser-rounded display ratios without decimal output", () => {
    expect(formatAspectRatio(1366, 768)).toBe("16:9");
    expect(formatAspectRatio(390, 844)).toBe("6:13");
  });

  it("falls back to a valid square ratio for invalid dimensions", () => {
    expect(integerAspectRatio(Number.NaN, 0)).toEqual({ width: 1, height: 1 });
  });

  it("keeps scalar ratios compact for DPR values", () => {
    expect(formatDecimalRatio(1.5)).toBe("1.5");
    expect(formatDecimalRatio(2)).toBe("2");
  });
});
