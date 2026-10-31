import type { Settings } from "../settings";
import { TaskChecklist } from "../TaskChecklist";
import type { SlotTaskState } from "./useSlotTask";

type SlotTaskDetailProps = {
  state: SlotTaskState;
  settings: Settings;
  onRetry: () => void;
  onOpenSettings: () => void;
};

/**
 * 時間割のコマの下に開いたタスクの詳細。読み込み中、失敗、チェックリストを出し分ける。
 *
 * @remarks 読み込みと質問の見分けは useSlotTask が持つ。ここは状態を受けて出すだけ。
 */
export const SlotTaskDetail = (props: SlotTaskDetailProps) => {
  const { state, settings, onRetry, onOpenSettings } = props;
  if (state.status === "closed") {
    return null;
  }
  if (state.status === "loading") {
    return <p className="subtasks-note muted">読んでいます</p>;
  }
  if (state.status === "error") {
    const isSettingsAction = state.failure.action === "settings";
    return (
      <div className="message message-error" role="alert">
        <p>{state.failure.reason}</p>
        <p>{state.failure.hint}</p>
        {isSettingsAction && (
          <button type="button" className="button button-small" onClick={onOpenSettings}>
            設定を開く
          </button>
        )}
        {!isSettingsAction && (
          <button type="button" className="button button-small" onClick={onRetry}>
            読み直す
          </button>
        )}
      </div>
    );
  }
  return (
    <TaskChecklist
      settings={settings}
      taskId={state.taskId}
      path={state.path}
      onOpenSettings={onOpenSettings}
    />
  );
};
