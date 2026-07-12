import { describe, expect, it } from "vitest";
import {
  recommendedSingleFileLimit,
  validateFileForEncoding,
  warningSingleFileLimit,
} from "./filePolicy";

describe("file encoding policy", () => {
  it("explains empty, valid, warning and blocked file states", () => {
    expect(validateFileForEncoding(null)).toEqual({ kind: "empty" });
    expect(validateFileForEncoding({ name: "empty.bin", size: 0 }).kind).toBe("blocked");
    expect(validateFileForEncoding({ name: "ok.bin", size: recommendedSingleFileLimit }).kind).toBe(
      "valid",
    );
    expect(
      validateFileForEncoding({ name: "../warn.bin", size: recommendedSingleFileLimit + 1 }),
    ).toMatchObject({
      kind: "warning",
      name: ".._warn.bin",
    });
    expect(
      validateFileForEncoding({ name: "huge.bin", size: warningSingleFileLimit + 1 }),
    ).toMatchObject({
      kind: "blocked",
      message: "This file is beyond the direct browser transfer limit.",
    });
    expect(validateFileForEncoding({ name: "bad.bin", size: -1 })).toMatchObject({
      kind: "blocked",
      message: "Byte size must be a non-negative integer.",
    });
  });
});
