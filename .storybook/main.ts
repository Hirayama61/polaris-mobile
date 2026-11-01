import type { StorybookConfig } from "@storybook/react-vite";
import { CSP_PLUGIN_NAME } from "../src/csp";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    // PWA の service worker と本番の CSP は Storybook では要らず、静的ビルドの配信先も GitHub Pages の base とは違う。
    base: "./",
    plugins: (viteConfig.plugins ?? []).flat().filter((plugin) => {
      const name = plugin !== null && typeof plugin === "object" && "name" in plugin ? plugin.name : "";
      return !String(name).startsWith("vite-plugin-pwa") && name !== CSP_PLUGIN_NAME;
    }),
  }),
};

export default config;
