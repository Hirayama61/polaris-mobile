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
