import { useCallback, useRef, useState } from "react";
import { describeFailure, type Failure } from "../failure";
import { readText } from "../github";
import { getQuestionItem, type QuestionItem } from "../questions";
import type { Settings } from "../settings";
import { taskPathOf } from "../tasks";

/**
 * 時間割のコマの下に開いたタスクの詳細。`slot` は開いたコマの見分け。
 */
export type SlotTaskState =
  | { status: "closed" }
  | { status: "loading"; slot: string }
  | { status: "checklist"; slot: string; taskId: string; path: string }
  | { status: "error"; slot: string; taskId: string; failure: Failure };

/**
 * 時間割のコマの `(task: ID)` を開く。
 *
 * 質問かどうかは task の title を読むまで分からないので、タップしたときに読んで決める。
 * 質問なら回答のシートを開き、それ以外はコマの下にチェックリストを開く。
 *
 * @remarks daily には触れない。チェックリストの読み書きは TaskChecklist、回答は QuestionSheet が持つ。
 */
export const useSlotTask = (settings: Settings) => {
  const [detail, setDetail] = useState<SlotTaskState>({ status: "closed" });
  const [question, setQuestion] = useState<QuestionItem | undefined>(undefined);
  // 読み込み中に別のコマを開いたり閉じたりしたとき、古い結果で上書きしないための番号。
  const requestRef = useRef(0);

  const open = (slot: string, taskId: string): void => {
    const path = taskPathOf(taskId);
    const isUnsafeId = path === undefined;
    if (isUnsafeId) {
      return;
    }
    const request = ++requestRef.current;
    setDetail({ status: "loading", slot });
    readText(settings, path)
      .then((text) => {
        const isStaleRequest = request !== requestRef.current;
        if (isStaleRequest) {
          return;
        }
        // ファイルが無いときは、チェックリストの側で「見つかりません」と出す。
        const isMissing = text === undefined;
        if (isMissing) {
          setDetail({ status: "checklist", slot, taskId, path });
          return;
        }
        const item = getQuestionItem(taskId, text);
        const isQuestion = item !== undefined;
        if (!isQuestion) {
          setDetail({ status: "checklist", slot, taskId, path });
          return;
        }
        setDetail({ status: "closed" });
        setQuestion(item);
      })
      .catch((error: unknown) => {
        const isCurrentRequest = request === requestRef.current;
        if (isCurrentRequest) {
          setDetail({ status: "error", slot, taskId, failure: describeFailure(error) });
        }
      });
  };

  const close = (): void => {
    requestRef.current += 1;
    setDetail({ status: "closed" });
  };

  const closeQuestion = useCallback(() => setQuestion(undefined), []);

  return { detail, question, open, close, closeQuestion };
};
