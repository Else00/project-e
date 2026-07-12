import { describe, expect, it } from "vitest";
import { isThemePreference, resolveThemePreference, themeOptions, themeStorageKey } from "./theme";

describe("theme model", () => {
  it("accepts only supported preferences", () => {
    expect(themeStorageKey).toBe("cimbar-workbench-theme");
    expect(themeOptions.map((option) => option.id)).toEqual(["system", "light", "dark"]);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("resolves system, light and dark modes", () => {
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
    expect(resolveThemePreference("light", true)).toBe("light");
    expect(resolveThemePreference("dark", false)).toBe("dark");
  });
});
