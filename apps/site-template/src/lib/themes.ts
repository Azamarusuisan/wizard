export const themes = {
  honestNavy: {
    name: "誠実ネイビー",
    primary: "#17324d",
    accent: "#f2b705",
    bg: "#f7fafc",
    text: "#17202a"
  },
  livelyOrange: {
    name: "元気オレンジ",
    primary: "#9a3f12",
    accent: "#0f766e",
    bg: "#fffaf2",
    text: "#24150f"
  },
  premiumGreen: {
    name: "上質ダークグリーン",
    primary: "#173b2f",
    accent: "#c9a227",
    bg: "#f6f8f4",
    text: "#17211c"
  }
} as const;

export type ThemeName = keyof typeof themes;
