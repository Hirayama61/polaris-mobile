import { useState, type ChangeEvent } from "react";
import type { Settings } from "../settings";

type Props = {
  settings: Settings;
  onSave: (settings: Settings) => void;
};

/**
 * GitHub の接続設定を入力して localStorage に保存する。
 */
export const SettingsScreen = ({ settings, onSave }: Props) => {
  const [draft, setDraft] = useState<Settings>(settings);
  const [isTokenVisible, setIsTokenVisible] = useState(false);

  const update = (key: keyof Settings) => (event: ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [key]: event.target.value });

  const canSave =
    draft.token.trim() !== "" &&
    draft.owner.trim() !== "" &&
    draft.repo.trim() !== "" &&
    draft.branch.trim() !== "";

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) {
          onSave(draft);
        }
      }}
    >
      <h2 className="card-title">GitHub</h2>

      <label className="field">
        <span className="field-label">Fine-grained PAT</span>
        <input
          className="input"
          type={isTokenVisible ? "text" : "password"}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={draft.token}
          placeholder="github_pat_…"
          onChange={update("token")}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={isTokenVisible}
          onChange={(event) => setIsTokenVisible(event.target.checked)}
        />
        <span>トークンを表示</span>
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">owner</span>
          <input
            className="input"
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={draft.owner}
            onChange={update("owner")}
          />
        </label>
        <label className="field">
          <span className="field-label">repo</span>
          <input
            className="input"
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={draft.repo}
            onChange={update("repo")}
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">ブランチ</span>
        <input
          className="input"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={draft.branch}
          onChange={update("branch")}
        />
      </label>

      <p className="muted">
        トークンはこの端末の localStorage にだけ保存します。対象リポジトリを <code>polaris-data</code> だけにし、権限は
        Contents の Read and write だけにしてください。
      </p>

      <button type="submit" className="button button-primary" disabled={!canSave}>
        保存
      </button>
    </form>
  );
};
