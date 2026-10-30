import type { Failure } from "../failure";
import { StateCard } from "../ui";

/**
 * PAT が未設定のときに内容の代わりに出す札。
 */
export const UnconfiguredCard = ({ onOpenSettings }: { onOpenSettings: () => void }) => (
  <StateCard
    title="GitHub のトークンが未設定です"
    action={
      <button type="button" className="button button-primary" onClick={onOpenSettings}>
        設定を開く
      </button>
    }
  >
    <p className="muted">トークンを入れると、今日の計画が出ます。</p>
  </StateCard>
);

type FailureActionProps = {
  failure: Failure;
  onRetry: () => void;
  onOpenSettings: () => void;
};

/**
 * 失敗の次の一手のボタン。設定の見直しが要るときだけ設定へ送る。
 */
export const FailureAction = ({ failure, onRetry, onOpenSettings }: FailureActionProps) =>
  failure.action === "settings" ? (
    <button type="button" className="button button-primary" onClick={onOpenSettings}>
      設定を開く
    </button>
  ) : (
    <button type="button" className="button" onClick={onRetry}>
      読み直す
    </button>
  );

/**
 * オフラインで保存を押したときの失敗。
 */
export const OFFLINE_SAVE_FAILURE: Failure = {
  reason: "オフラインのため保存できません。",
  hint: "つながったら、もう一度保存してください。",
  action: "retry",
};

type FailureMessageProps = {
  failure: Failure;
  onOpenSettings: () => void;
};

/**
 * 保存の失敗を、理由と次の一手で示す。やり直しは元のボタンを押し直せばよいので、設定へ送るときだけボタンを出す。
 */
export const FailureMessage = (props: FailureMessageProps) => {
  const { failure, onOpenSettings } = props;
  const needsSettings = failure.action === "settings";
  return (
    <div className="message message-error" role="alert">
      <p>{failure.reason}</p>
      <p>{failure.hint}</p>
      {needsSettings && (
        <button type="button" className="button button-small" onClick={onOpenSettings}>
          設定を開く
        </button>
      )}
    </div>
  );
};
