import { useEffect } from "react";
import type { ChangelogEntry } from "./changelog";
import { CloseIcon } from "./ui";

type Props = {
  entries: readonly ChangelogEntry[];
  onClose: () => void;
};

/**
 * アプリ本体の更新履歴を新しい順に読むシート。履歴はビルド時に埋め込み済みで、通信しない。
 */
export const ChangelogSheet = ({ entries, onClose }: Props) => {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    // 背面のスクロールを止める。
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id="changelog-title" className="sheet-title">
            更新履歴
          </h2>
          <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="panel panel-empty muted">更新履歴がありません。</p>
        ) : (
          <ul className="panel changelog-list">
            {entries.map((entry) => (
              <li key={entry.hash} className="changelog-item">
                <span className="changelog-meta">
                  {entry.date} · {entry.hash}
                </span>
                <span className="changelog-subject">{entry.subject}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
