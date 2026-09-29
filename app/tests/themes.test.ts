import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestContrastText,
  contrastRatio,
  normalizeLayout,
  normalizeThemeFamily,
  normalizeThemeMode,
  themeDefinitions,
  themeFamilies,
  type ThemeTokens,
} from "../src/styles/themes.ts";

// Every surface the interface draws text on.
const textSurfaces: Array<keyof ThemeTokens> = [
  "appBg", "sidebarBg", "toolbarBg", "boardBg", "columnBg", "columnHeaderBg", "cardBg", "cardHoverBg",
  "modalBg", "popoverBg", "inputBg", "buttonBg", "buttonHoverBg", "addColumnBg",
];

const tint = (color: string, base: string, amount: number) => {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(color, i) * amount + channel(base, i) * (1 - amount)).toString(16).padStart(2, "0"))
    .join("")}`;
};

function contrastProblems(tokens: ThemeTokens) {
  const problems: string[] = [];
  const need = (fg: string, bg: string, min: number, what: string) => {
    const ratio = contrastRatio(fg, bg);
    if (ratio < min) problems.push(`${what} ${ratio.toFixed(2)}:1`);
  };
  for (const surface of textSurfaces) {
    need(tokens.textPrimary, tokens[surface], 4.5, `textPrimary on ${surface}`);
    need(tokens.textSecondary, tokens[surface], 4.5, `textSecondary on ${surface}`);
    need(tokens.textMuted, tokens[surface], 4.5, `textMuted on ${surface}`);
  }
  for (const surface of ["appBg", "cardBg", "modalBg", "columnBg", "sidebarBg", "popoverBg"] as const) {
    need(tokens.accent, tokens[surface], 4.5, `accent text on ${surface}`);
  }
  for (const color of ["accent", "success", "warning", "danger"] as const) {
    need(tokens[color], tint(tokens[color], tokens.cardBg, 0.14), 4.5, `${color} pill text`);
  }
  need(tokens.danger, tokens.modalBg, 4.5, "danger text on modalBg");
  need(tokens.danger, tokens.toolbarBg, 4.5, "danger text on toolbarBg");
  need(bestContrastText(tokens.accent), tokens.accent, 4.5, "button text on accent");
  need(bestContrastText(tokens.accentHover), tokens.accentHover, 4.5, "button text on accentHover");
  need(bestContrastText(tokens.danger), tokens.danger, 4.5, "button text on danger");
  return problems;
}

for (const family of themeFamilies) {
  for (const mode of ["dark", "light"] as const) {
    test(`${family.label} ${mode} meets WCAG AA contrast`, () => {
      assert.deepEqual(contrastProblems(themeDefinitions[family.id][mode]), []);
    });
  }
}

test("stored appearance values are normalized", () => {
  assert.equal(normalizeThemeFamily("gruvbox-dark"), "gruvbox");
  assert.equal(normalizeThemeFamily("unknown"), "default");
  assert.equal(normalizeThemeMode("sepia"), "system");
  assert.equal(normalizeLayout("compact"), "compact");
  assert.equal(normalizeLayout(undefined), "comfortable");
});
