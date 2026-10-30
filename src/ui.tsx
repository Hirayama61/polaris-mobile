import type { ReactNode } from "react";

type IconProps = { size?: number };

// lucide の形を手で写した線画アイコン。ライブラリは入れない。
const svgProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/**
 * 要望の入口に使う吹き出し。
 */
export const MessageIcon = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)} aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

/**
 * シートを閉じる×。
 */
export const CloseIcon = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)} aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * タブ「今日」。
 */
export const SunIcon = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)} aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

/**
 * タブ「夜」。
 */
export const MoonIcon = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)} aria-hidden="true">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

/**
 * タブ「ブログ」。
 */
export const PenIcon = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)} aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.86z" />
  </svg>
);

/**
 * タブ「受信箱」。
 */
export const InboxIcon = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)} aria-hidden="true">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

/**
 * タブ「設定」。
 */
export const GearIcon = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)} aria-hidden="true">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

type StateCardProps = {
  title: string;
  tone?: "plain" | "error";
  children?: ReactNode;
  action?: ReactNode;
};

/**
 * 内容の代わりに出す状態の札。空の日・未設定・失敗で同じ形を使う。
 */
export const StateCard = ({ title, tone = "plain", children, action }: StateCardProps) => (
  <section
    className={tone === "error" ? "state state-error" : "state"}
    role={tone === "error" ? "alert" : undefined}
  >
    <p className="state-title">{title}</p>
    {children !== undefined && <div className="state-body">{children}</div>}
    {action !== undefined && <div className="state-action">{action}</div>}
  </section>
);
