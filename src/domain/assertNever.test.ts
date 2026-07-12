import { describe, expect, it } from "vitest";
import { assertNever } from "./assertNever";

describe("assertNever", () => {
  it("throws with the unexpected value serialized", () => {
    expect(() => assertNever("bad" as never, "Variant")).toThrow('Variant: "bad"');
  });
});
