import type { Meta, StoryObj } from "@storybook/react-vite";
import { FailureAction, UnconfiguredCard } from "./common";

const meta = {
  title: "screens/common",
  component: UnconfiguredCard,
  args: { onOpenSettings: () => {} },
} satisfies Meta<typeof UnconfiguredCard>;

export default meta;

export const Unconfigured: StoryObj<typeof meta> = {};

export const FailureRetry: StoryObj<typeof FailureAction> = {
  render: () => (
    <FailureAction
      failure={{ reason: "GitHub に接続できません。", hint: "もう一度試してください。", action: "retry" }}
      onRetry={() => {}}
      onOpenSettings={() => {}}
    />
  ),
};

export const FailureSettings: StoryObj<typeof FailureAction> = {
  render: () => (
    <FailureAction
      failure={{ reason: "トークンが無効です。", hint: "設定を見直してください。", action: "settings" }}
      onRetry={() => {}}
      onOpenSettings={() => {}}
    />
  ),
};
