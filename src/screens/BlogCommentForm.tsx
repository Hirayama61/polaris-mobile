import { useState } from "react";
import { setComment } from "../blog";
import type { Settings } from "../settings";
import { useBlogSave } from "../useBlogSave";
import { FailureMessage } from "./common";

type Props = {
  settings: Settings;
  isOnline: boolean;
  /** 書くファイル (outline か draft) のパス。 */
  path: string;
  initialComment: string;
  onSaved: () => void;
  onOpenSettings: () => void;
};

/**
 * outline か draft の「## 一言」を書いて保存する。
 *
 * @remarks どのファイルに書くかは持たない。一覧を読み直すのは `onSaved` を受けた側。
 */
export const BlogCommentForm = (props: Props) => {
  const { settings, isOnline, path, initialComment, onSaved, onOpenSettings } = props;
  const [comment, setCommentDraft] = useState(initialComment);
  const { state, save } = useBlogSave(settings, isOnline, onSaved);
  const isSaving = state.status === "saving";
  const isChanged = comment.trim() !== initialComment.trim();
  const canSave = isChanged && !isSaving;
  const isSaved = state.status === "saved" && !isChanged;
  const buttonLabel = isSaving ? "保存中…" : "一言を保存";

  return (
    <section className="section">
      <label className="field">
        <span className="section-head">
          <span className="section-title">一言</span>
          <span className="section-meta">執筆ループが次の版で読む</span>
        </span>
        <textarea
          className="textarea"
          readOnly={isSaving}
          rows={4}
          value={comment}
          placeholder="直してほしいこと、足してほしいこと"
          onChange={(event) => setCommentDraft(event.target.value)}
        />
      </label>
      {isSaved && (
        <p className="save-note save-note-ok" role="status">
          一言を保存しました
        </p>
      )}
      {state.status === "error" && <FailureMessage failure={state.failure} onOpenSettings={onOpenSettings} />}
      <button
        type="button"
        className="button button-primary button-block"
        disabled={!canSave}
        onClick={() => save(path, "chore(mobile): ブログの一言", (current) => setComment(current, comment))}
      >
        {buttonLabel}
      </button>
    </section>
  );
};
