import type { Meta, StoryObj } from "@storybook/react-vite";
import { defaultSettings } from "../settings";
import { SettingsScreen } from "./Settings";

const meta = {
  title: "screens/Settings",
  component: SettingsScreen,
  args: {
    settings: defaultSettings,
    onSave: () => {},
    onOpenChangelog: () => {},
  },
  decorators: [
    (Story) => (
      <>
        {/* 版の表記は commit の hash を含み、commit ごとに VRT の基準とずれるので隠す。 */}
        <style>{".app-version { visibility: hidden; }"}</style>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof SettingsScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unconfigured: Story = {};

export const Configured: Story = {
  args: { settings: { ...defaultSettings, token: "github_pat_example" } },
};
