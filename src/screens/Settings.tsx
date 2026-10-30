import { type ChangeEvent, useState } from "react";
import type { Settings } from "../settings";

type Props = {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onOpenProjects: () => void;
  onOpenTasks: () => void;
};

const textInputProps = {
  className: "input",
  type: "text",
  autoCapitalize: "off",
  autoCorrect: "off",
  spellCheck: false,
} as const;

const settingKeys = ["token", "owner", "repo", "branch"] as const satisfies readonly (keyof Settings)[];

/**
 * GitHub の接続設定を入力して localStorage に保存する。プロジェクトのシートもここから開く。
 */
export const SettingsScreen = ({ settings, onSave, onOpenProjects, onOpenTasks }: Props) => {
  const [draft, setDraft] = useState<Settings>(settings);
  const [isTokenVisible, setIsTokenVisible] = useState(false);

  const update = (key: keyof Settings) => (event: ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [key]: event.target.value });

  const isChanged = settingKeys.some((key) => draft[key].trim() !== settings[key]);
  const canSave =
    draft.token.trim() !== "" &&
    draft.owner.trim() !== "" &&
    draft.repo.trim() !== "" &&
    draft.branch.trim() !== "" &&
    isChanged;

  // Enter で黙って送信しないよう、form の submit は使わない。
  return (
    <>
      <section className="section">
        <h2 className="section-title">GitHub</h2>
        <div className="panel panel-form">
          <label className="field">
            <span className="field-label">トークン(fine-grained PAT)</span>
            <span className="input-with-action">
              <input
                {...textInputProps}
                type={isTokenVisible ? "text" : "password"}
                autoComplete="off"
                value={draft.token}
                placeholder="github_pat_…"
                onChange={update("token")}
              />
              <button
                type="button"
                className="input-action"
                aria-pressed={isTokenVisible}
                onClick={() => setIsTokenVisible(!isTokenVisible)}
              >
                {isTokenVisible ? "隠す" : "表示"}
              </button>
            </span>
            <span className="field-hint">この端末にだけ保存します。作り方は README にあります。</span>
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-label">owner</span>
              <input {...textInputProps} value={draft.owner} onChange={update("owner")} />
            </label>
            <label className="field">
              <span className="field-label">データのリポジトリ</span>
              <input {...textInputProps} value={draft.repo} onChange={update("repo")} />
            </label>
          </div>

          <label className="field">
            <span className="field-label">ブランチ</span>
            <input {...textInputProps} value={draft.branch} onChange={update("branch")} />
          </label>
        </div>
      </section>

      <div className="save-bar save-bar-static">
        <button
          type="button"
          className="button button-primary button-block"
          disabled={!canSave}
          onClick={() => onSave(draft)}
        >
          保存
        </button>
        <button type="button" className="button button-block" onClick={onOpenProjects}>
          プロジェクトを見る
        </button>
        <button type="button" className="button button-block" onClick={onOpenTasks}>
          タスクを見る
        </button>
        <p className="app-version">Polaris Mobile v{__APP_VERSION__}</p>
      </div>
    </>
  );
};
