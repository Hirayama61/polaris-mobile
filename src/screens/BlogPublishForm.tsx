import { useState } from "react";
import { isPublicUrl, publishDraft } from "../blog";
import type { Settings } from "../settings";
import { useBlogSave } from "../useBlogSave";
import { FailureMessage } from "./common";

type Props = {
  settings: Settings;
  isOnline: boolean;
  /** draft のパス。 */
  path: string;
  onSaved: () => void;
  onOpenSettings: () => void;
};

/**
 * 公開した記事の URL を受け取り、draft を `status: done` にする。
 *
 * @remarks 公開済みかどうかの判定は持たない。出すかどうかは呼ぶ側が決める。
 */
export const BlogPublishForm = (props: Props) => {
  const { settings, isOnline, path, onSaved, onOpenSettings } = props;
  const [url, setUrl] = useState("");
  const { state, save } = useBlogSave(settings, isOnline, onSaved);
  const isSaving = state.status === "saving";
  const isEmpty = url.trim() === "";
  const isValid = isPublicUrl(url);
  const isInvalid = !isEmpty && !isValid;
  const canSave = isValid && !isSaving;
  const buttonLabel = isSaving ? "保存中…" : "公開した";

  return (
    <section className="section">
      <label className="field">
        <span className="section-head">
          <span className="section-title">公開した記事の URL</span>
        </span>
        <input
          className="input"
          type="url"
          inputMode="url"
          autoComplete="off"
          readOnly={isSaving}
          value={url}
          placeholder="https://"
          aria-invalid={isInvalid}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      {isInvalid && (
        <p className="field-hint field-hint-error">http か https で始まる URL を入れてください。</p>
      )}
      {state.status === "error" && <FailureMessage failure={state.failure} onOpenSettings={onOpenSettings} />}
      <button
        type="button"
        className="button button-block"
        disabled={!canSave}
        onClick={() =>
          save(path, "chore(mobile): ブログを公開済みにする", (current) => publishDraft(current, url.trim()))
        }
      >
        {buttonLabel}
      </button>
    </section>
  );
};
