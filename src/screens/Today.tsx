import { useState } from "react";
import { extractTurns, parseDaily, setTurnChecked, type TurnItem } from "../daily";
import { GitHubError, writeKnownFile } from "../github";
import type { Settings } from "../settings";
import { dailyPath, useDaily } from "../useDaily";

type Props = {
  settings: Settings;
  date: string;
  daily: ReturnType<typeof useDaily>;
  isOnline: boolean;
  onOpenSettings: () => void;
};

type WriteState =
  | { status: "idle" }
  | { status: "writing"; line: number }
  | { status: "error"; message: string };

const describe = (error: unknown): string =>
  error instanceof GitHubError || error instanceof Error
    ? error.message
    : String(error);

const OFFLINE_MESSAGE = "オフラインです。オンラインになってからチェックしてください";

/**
 * 今日の時間割と「あなたの番」を表示し、チェックを GitHub へ commit する。
 */
export const TodayScreen = ({ settings, date, daily, isOnline, onOpenSettings }: Props) => {
  const [write, setWrite] = useState<WriteState>({ status: "idle" });
  const { state } = daily;

  if (state.status === "unconfigured") {
    return (
      <section className="card">
        <p>GitHub の設定がまだありません。</p>
        <button type="button" className="button button-primary" onClick={onOpenSettings}>
          設定を開く
        </button>
      </section>
    );
  }
  if (state.status === "loading") {
    return <p className="status">読み込み中…</p>;
  }
  if (state.status === "error") {
    return (
      <section className="card">
        <p className="message message-error">{state.message}</p>
        <button type="button" className="button" onClick={daily.reload}>
          再読み込み
        </button>
      </section>
    );
  }
  if (state.status === "missing") {
    return (
      <section className="card">
        <p>今日の計画はまだありません。</p>
        <p className="muted">朝ジョブが <code>{dailyPath(date)}</code> を作ると表示されます。</p>
        <button type="button" className="button" onClick={daily.reload}>
          再読み込み
        </button>
      </section>
    );
  }

  const view = parseDaily(state.content);

  const handleToggle = (turn: TurnItem): void => {
    if (write.status === "writing") {
      return;
    }
    if (!isOnline) {
      setWrite({ status: "error", message: OFFLINE_MESSAGE });
      return;
    }
    const nextChecked = !turn.isChecked;
    setWrite({ status: "writing", line: turn.line });
    writeKnownFile(
      settings,
      dailyPath(date),
      `chore(mobile): ${date} のチェック`,
      { content: state.content, sha: state.sha },
      // 再試行時はリモートの最新内容に当てるので、行番号ではなくラベルで探し直す。
      (current) => {
        const target = extractTurns(current).find((candidate) => candidate.label === turn.label);
        return target === undefined ? current : setTurnChecked(current, target.line, nextChecked);
      },
    )
      .then((written) => {
        daily.replace(written.content, written.sha);
        setWrite({ status: "idle" });
      })
      .catch((error: unknown) => {
        setWrite({ status: "error", message: `保存できませんでした: ${describe(error)}` });
      });
  };

  return (
    <>
      {state.notice !== undefined && <p className="message message-notice">{state.notice}</p>}

      <section className="card">
        <h2 className="card-title">今日の時間割</h2>
        {view.schedule.length === 0 ? (
          <p className="muted">時間割がありません。</p>
        ) : (
          <table className="schedule">
            <thead>
              <tr>
                <th>時刻</th>
                <th>やること</th>
                <th>誰</th>
              </tr>
            </thead>
            <tbody>
              {view.schedule.map((row, index) => (
                <tr key={index} className={row.who === "あなた" ? "schedule-mine" : undefined}>
                  <td className="schedule-time">{row.time}</td>
                  <td>{row.what}</td>
                  <td className="schedule-who">{row.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">あなたの番</h2>
        {view.turns.length === 0 ? (
          <p className="muted">項目がありません。</p>
        ) : (
          <ul className="turns">
            {view.turns.map((turn) => {
              const isWriting = write.status === "writing" && write.line === turn.line;
              return (
                <li key={turn.line}>
                  <label className={turn.isChecked ? "turn turn-checked" : "turn"}>
                    <input
                      type="checkbox"
                      checked={turn.isChecked}
                      disabled={write.status === "writing"}
                      onChange={() => handleToggle(turn)}
                    />
                    <span className="turn-label">{turn.label}</span>
                    {isWriting && <span className="turn-status">保存中…</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {write.status === "error" && (
          <p className="message message-error" role="alert">
            {write.message}
          </p>
        )}
      </section>
    </>
  );
};
