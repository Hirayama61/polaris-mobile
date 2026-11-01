import type { InboxItem } from "./inbox";
import { type IconProps, svgProps } from "./ui";

const QuestionIcon = (props: IconProps) => {
  const { size = 22 } = props;
  return (
    <svg {...svgProps(size)} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
};

const TaskIcon = (props: IconProps) => {
  const { size = 22 } = props;
  return (
    <svg {...svgProps(size)} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
};

type KindMarkProps = {
  kind: InboxItem["kind"];
};

/**
 * タスクか質問かを行の先頭のアイコンで示す。
 *
 * @remarks 行の形は持たない。受信箱とプロジェクトのシートの一覧が、タイトルの位置を揃えるために同じ印を使う。
 */
export const KindMark = (props: KindMarkProps) => {
  const { kind } = props;
  const isQuestion = kind === "question";
  if (isQuestion) {
    return (
      <span className="inbox-kind inbox-kind-question" role="img" aria-label="質問">
        <QuestionIcon size={18} />
      </span>
    );
  }
  return (
    <span className="inbox-kind" role="img" aria-label="タスク">
      <TaskIcon size={18} />
    </span>
  );
};
