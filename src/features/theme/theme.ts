export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const themeStorageKey = "cimbar-workbench-theme";

export const themeOptions: readonly {
  readonly id: ThemePreference;
  readonly label: string;
  readonly detail: string;
}[] = [
  { id: "system", label: "System", detail: "Follow OS preference." },
  { id: "light", label: "Light", detail: "Force light UI." },
  { id: "dark", label: "Dark", detail: "Force dark UI." },
];

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}
