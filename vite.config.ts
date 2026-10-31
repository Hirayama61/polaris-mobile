import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";
import packageJson from "./package.json" with { type: "json" };
import { CHANGELOG_GIT_FORMAT, CHANGELOG_PATHS, parseChangelog } from "./src/changelog";

// 浅い clone や git の無い環境では履歴を空にしてビルドを続ける。
const readChangelog = () => {
  try {
    const raw = execFileSync(
      "git",
      ["log", "--no-merges", "--max-count=50", `--format=${CHANGELOG_GIT_FORMAT}`, "--", ...CHANGELOG_PATHS],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return parseChangelog(raw);
  } catch {
    return [];
  }
};

export default defineConfig({
  base: "/polaris-mobile/",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_CHANGELOG__: JSON.stringify(readChangelog()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Polaris Mobile",
        short_name: "Polaris",
        description: "Polaris の今日の計画と夜の振り返りをスマホから読み書きする",
        lang: "ja",
        display: "standalone",
        start_url: "/polaris-mobile/",
        scope: "/polaris-mobile/",
        background_color: "#eef2f6",
        theme_color: "#eef2f6",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
