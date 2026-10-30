import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloseIcon, GearIcon, MessageIcon, MoonIcon, StateCard, SunIcon } from "./ui";

const meta = {
  title: "ui/StateCard",
  component: StateCard,
  args: { title: "今日の計画はまだありません" },
} satisfies Meta<typeof StateCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  args: {
    children: <p className="muted">毎朝 6:00 に朝ジョブが作ります。夜の振り返りは今日も書けます。</p>,
    action: (
      <button type="button" className="button">
        読み直す
      </button>
    ),
  },
};

export const ErrorTone: Story = {
  args: {
    title: "今日の計画を読めませんでした",
    tone: "error",
    children: (
      <>
        <p>GitHub に接続できません。</p>
        <p className="muted">電波の届く場所でもう一度試してください。</p>
      </>
    ),
    action: (
      <button type="button" className="button">
        読み直す
      </button>
    ),
  },
};

export const TitleOnly: Story = {};

export const Icons: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <SunIcon />
      <MoonIcon />
      <GearIcon />
      <MessageIcon />
      <CloseIcon />
    </div>
  ),
};
