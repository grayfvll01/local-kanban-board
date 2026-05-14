export type ThemeFamily = "default" | "everforest" | "catppuccin" | "nord" | "gruvbox";
export type ThemeMode = "dark" | "light" | "system";
export type ResolvedThemeMode = "dark" | "light";

export interface ThemeTokens {
  appBg: string;
  sidebarBg: string;
  toolbarBg: string;
  boardBg: string;
  columnBg: string;
  columnHeaderBg: string;
  cardBg: string;
  cardHoverBg: string;
  modalBg: string;
  popoverBg: string;
  inputBg: string;
  buttonBg: string;
  buttonHoverBg: string;
  addColumnBg: string;
  addColumnHoverBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  success: string;
  warning: string;
  danger: string;
  shadow: string;
}

export const themeFamilies: Array<{ id: ThemeFamily; label: string }> = [
  { id: "default", label: "Default" },
  { id: "everforest", label: "Everforest" },
  { id: "catppuccin", label: "Catppuccin" },
  { id: "nord", label: "Nord" },
  { id: "gruvbox", label: "Gruvbox" },
];

export const themeModes: Array<{ id: ThemeMode; label: string }> = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
];

export const themeDefinitions: Record<ThemeFamily, Record<ResolvedThemeMode, ThemeTokens>> = {
  default: {
    dark: makeTokens({
      appBg: "#0b0f16",
      sidebarBg: "#10141d",
      toolbarBg: "#0f141d",
      boardBg: "#0b0f16",
      columnBg: "#10141d",
      columnHeaderBg: "#141a24",
      cardBg: "#1a2230",
      cardHoverBg: "#202b3b",
      modalBg: "#111721",
      popoverBg: "#151c27",
      inputBg: "#171f2c",
      buttonBg: "#172131",
      buttonHoverBg: "#213047",
      addColumnBg: "#172131",
      addColumnHoverBg: "#213047",
      textPrimary: "#e2e8f0",
      textSecondary: "#cbd5e1",
      textMuted: "#94a3b8",
      border: "rgba(255, 255, 255, 0.10)",
      borderStrong: "rgba(255, 255, 255, 0.18)",
      accent: "#22d3ee",
      accentHover: "#14b8a6",
      success: "#22c55e",
      warning: "#f59e0b",
      danger: "#ef4444",
      shadow: "rgba(0, 0, 0, 0.38)",
    }),
    light: makeTokens({
      appBg: "#eef2f7",
      sidebarBg: "#f8fafc",
      toolbarBg: "#ffffff",
      boardBg: "#eef2f7",
      columnBg: "#ffffff",
      columnHeaderBg: "#f8fafc",
      cardBg: "#f1f5f9",
      cardHoverBg: "#e2e8f0",
      modalBg: "#ffffff",
      popoverBg: "#f8fafc",
      inputBg: "#f1f5f9",
      buttonBg: "#f1f5f9",
      buttonHoverBg: "#e2e8f0",
      addColumnBg: "#ffffff",
      addColumnHoverBg: "#e2e8f0",
      textPrimary: "#0f172a",
      textSecondary: "#334155",
      textMuted: "#64748b",
      border: "rgba(15, 23, 42, 0.12)",
      borderStrong: "rgba(15, 23, 42, 0.22)",
      accent: "#0891b2",
      accentHover: "#0f766e",
      success: "#16a34a",
      warning: "#d97706",
      danger: "#dc2626",
      shadow: "rgba(15, 23, 42, 0.14)",
    }),
  },
  everforest: {
    dark: makeTokens({
      appBg: "#2d353b",
      sidebarBg: "#232a2e",
      toolbarBg: "#2d353b",
      boardBg: "#2d353b",
      columnBg: "#343f44",
      columnHeaderBg: "#3d484d",
      cardBg: "#3d484d",
      cardHoverBg: "#475258",
      modalBg: "#343f44",
      popoverBg: "#3d484d",
      inputBg: "#3d484d",
      buttonBg: "#3d484d",
      buttonHoverBg: "#475258",
      addColumnBg: "#343f44",
      addColumnHoverBg: "#475258",
      textPrimary: "#d3c6aa",
      textSecondary: "#d3c6aa",
      textMuted: "#9da9a0",
      border: "#4f585e",
      borderStrong: "#56635f",
      accent: "#a7c080",
      accentHover: "#7fbbb3",
      success: "#a7c080",
      warning: "#dbbc7f",
      danger: "#e67e80",
      shadow: "rgba(30, 35, 38, 0.42)",
    }),
    light: makeTokens({
      appBg: "#fdf6e3",
      sidebarBg: "#efebd4",
      toolbarBg: "#fffbef",
      boardBg: "#fdf6e3",
      columnBg: "#f4f0d9",
      columnHeaderBg: "#efebd4",
      cardBg: "#fffbef",
      cardHoverBg: "#f2efdf",
      modalBg: "#fffbef",
      popoverBg: "#f4f0d9",
      inputBg: "#f2efdf",
      buttonBg: "#f2efdf",
      buttonHoverBg: "#e6e2cc",
      addColumnBg: "#f4f0d9",
      addColumnHoverBg: "#e6e2cc",
      textPrimary: "#5c6a72",
      textSecondary: "#5c6a72",
      textMuted: "#829181",
      border: "#d9d5ba",
      borderStrong: "#bec5b2",
      accent: "#8da101",
      accentHover: "#35a77c",
      success: "#8da101",
      warning: "#dfa000",
      danger: "#f85552",
      shadow: "rgba(92, 106, 114, 0.16)",
    }),
  },
  catppuccin: {
    dark: makeTokens({
      appBg: "#1e1e2e",
      sidebarBg: "#1e1e2e",
      toolbarBg: "#1e1e2e",
      boardBg: "#1e1e2e",
      columnBg: "#313244",
      columnHeaderBg: "#45475a",
      cardBg: "#45475a",
      cardHoverBg: "#6c7086",
      modalBg: "#313244",
      popoverBg: "#45475a",
      inputBg: "#313244",
      buttonBg: "#313244",
      buttonHoverBg: "#45475a",
      addColumnBg: "#313244",
      addColumnHoverBg: "#45475a",
      textPrimary: "#cdd6f4",
      textSecondary: "#a6adc8",
      textMuted: "#6c7086",
      border: "#45475a",
      borderStrong: "#6c7086",
      accent: "#cba6f7",
      accentHover: "#89b4fa",
      success: "#a6e3a1",
      warning: "#f9e2af",
      danger: "#f38ba8",
      shadow: "rgba(17, 17, 27, 0.42)",
    }),
    light: makeTokens({
      appBg: "#eff1f5",
      sidebarBg: "#eff1f5",
      toolbarBg: "#eff1f5",
      boardBg: "#eff1f5",
      columnBg: "#ccd0da",
      columnHeaderBg: "#ccd0da",
      cardBg: "#eff1f5",
      cardHoverBg: "#ccd0da",
      modalBg: "#eff1f5",
      popoverBg: "#ccd0da",
      inputBg: "#ccd0da",
      buttonBg: "#ccd0da",
      buttonHoverBg: "#bcc0cc",
      addColumnBg: "#ccd0da",
      addColumnHoverBg: "#bcc0cc",
      textPrimary: "#4c4f69",
      textSecondary: "#6c6f85",
      textMuted: "#9ca0b0",
      border: "#bcc0cc",
      borderStrong: "#9ca0b0",
      accent: "#8839ef",
      accentHover: "#1e66f5",
      success: "#40a02b",
      warning: "#df8e1d",
      danger: "#d20f39",
      shadow: "rgba(76, 79, 105, 0.14)",
    }),
  },
  nord: {
    dark: makeTokens({
      appBg: "#2e3440",
      sidebarBg: "#2e3440",
      toolbarBg: "#2e3440",
      boardBg: "#2e3440",
      columnBg: "#3b4252",
      columnHeaderBg: "#434c5e",
      cardBg: "#434c5e",
      cardHoverBg: "#4c566a",
      modalBg: "#3b4252",
      popoverBg: "#434c5e",
      inputBg: "#434c5e",
      buttonBg: "#434c5e",
      buttonHoverBg: "#4c566a",
      addColumnBg: "#3b4252",
      addColumnHoverBg: "#4c566a",
      textPrimary: "#d8dee9",
      textSecondary: "#e5e9f0",
      textMuted: "#e5e9f0",
      border: "#4c566a",
      borderStrong: "#5e81ac",
      accent: "#88c0d0",
      accentHover: "#81a1c1",
      success: "#a3be8c",
      warning: "#ebcb8b",
      danger: "#bf616a",
      shadow: "rgba(46, 52, 64, 0.44)",
    }),
    light: makeTokens({
      appBg: "#eceff4",
      sidebarBg: "#e5e9f0",
      toolbarBg: "#eceff4",
      boardBg: "#eceff4",
      columnBg: "#e5e9f0",
      columnHeaderBg: "#d8dee9",
      cardBg: "#f8fafc",
      cardHoverBg: "#d8dee9",
      modalBg: "#eceff4",
      popoverBg: "#e5e9f0",
      inputBg: "#d8dee9",
      buttonBg: "#d8dee9",
      buttonHoverBg: "#c8d0dc",
      addColumnBg: "#e5e9f0",
      addColumnHoverBg: "#c8d0dc",
      textPrimary: "#2e3440",
      textSecondary: "#3b4252",
      textMuted: "#4c566a",
      border: "#c8d0dc",
      borderStrong: "#4c566a",
      accent: "#5e81ac",
      accentHover: "#81a1c1",
      success: "#a3be8c",
      warning: "#d08770",
      danger: "#bf616a",
      shadow: "rgba(46, 52, 64, 0.14)",
    }),
  },
  gruvbox: {
    dark: makeTokens({
      appBg: "#282828",
      sidebarBg: "#1d2021",
      toolbarBg: "#282828",
      boardBg: "#282828",
      columnBg: "#32302f",
      columnHeaderBg: "#3c3836",
      cardBg: "#3c3836",
      cardHoverBg: "#504945",
      modalBg: "#32302f",
      popoverBg: "#3c3836",
      inputBg: "#3c3836",
      buttonBg: "#3c3836",
      buttonHoverBg: "#504945",
      addColumnBg: "#32302f",
      addColumnHoverBg: "#504945",
      textPrimary: "#ebdbb2",
      textSecondary: "#d5c4a1",
      textMuted: "#a89984",
      border: "#504945",
      borderStrong: "#665c54",
      accent: "#98971a",
      accentHover: "#689d6a",
      success: "#98971a",
      warning: "#d79921",
      danger: "#cc241d",
      shadow: "rgba(29, 32, 33, 0.44)",
    }),
    light: makeTokens({
      appBg: "#fbf1c7",
      sidebarBg: "#f2e5bc",
      toolbarBg: "#fbf1c7",
      boardBg: "#fbf1c7",
      columnBg: "#ebdbb2",
      columnHeaderBg: "#d5c4a1",
      cardBg: "#fbf1c7",
      cardHoverBg: "#ebdbb2",
      modalBg: "#fbf1c7",
      popoverBg: "#ebdbb2",
      inputBg: "#ebdbb2",
      buttonBg: "#ebdbb2",
      buttonHoverBg: "#d5c4a1",
      addColumnBg: "#ebdbb2",
      addColumnHoverBg: "#d5c4a1",
      textPrimary: "#3c3836",
      textSecondary: "#504945",
      textMuted: "#7c6f64",
      border: "#bdae93",
      borderStrong: "#a89984",
      accent: "#98971a",
      accentHover: "#689d6a",
      success: "#98971a",
      warning: "#d79921",
      danger: "#cc241d",
      shadow: "rgba(60, 56, 54, 0.16)",
    }),
  },
};

export function normalizeThemeFamily(value?: string): ThemeFamily {
  if (themeFamilies.some((theme) => theme.id === value)) return value as ThemeFamily;

  if (value?.includes("everforest")) return "everforest";
  if (value?.includes("catppuccin")) return "catppuccin";
  if (value?.includes("nord")) return "nord";
  if (value?.includes("gruvbox")) return "gruvbox";

  return "default";
}

export function normalizeThemeMode(value?: string): ThemeMode {
  if (value === "dark" || value === "light" || value === "system") return value;
  return "dark";
}

export function legacyThemeMode(value?: string): ThemeMode | undefined {
  if (!value) return undefined;
  if (value.startsWith("light")) return "light";
  if (value.startsWith("dark")) return "dark";
  return undefined;
}

export function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeTokens(family: ThemeFamily, mode: ThemeMode) {
  const resolvedMode = resolveThemeMode(mode);
  const tokens = themeDefinitions[family][resolvedMode];
  const root = document.documentElement;

  root.classList.toggle("dark", resolvedMode === "dark");
  root.dataset.theme = family;
  root.dataset.themeMode = mode;
  root.dataset.resolvedThemeMode = resolvedMode;

  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(cssVarName(key), value);
  });
}

function makeTokens(tokens: ThemeTokens): ThemeTokens {
  return tokens;
}

function cssVarName(key: string) {
  return `--color-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
}
