import { useState } from "react";
import { describeFailure, type Failure } from "../failure";
import { writeKnownFile } from "../github";
import type { Settings } from "../settings";
import { dailyPath, type useDaily } from "../useDaily";

/**
 * 直す行が、シートを開いた後に変わっていたか消えていたことを表す。上書きせずに知らせる。
 */
export class SlotChangedError extends Error {
  constructor() {
    super("このコマは、開いた後に変わっていました。");
  }
}

/**
 * 書こうとした変更が、もう daily に入っていたことを表す。応答を受け取れずに押し直したときに起きる。
 */
export class SlotAlreadySavedError extends Error {
  constructor() {
    super("このコマは、もう保存されていました。");
  }
}

/**
 * 時間割のコマを書く状態。`stale` は行が変わっていて上書きしなかったとき。
 */
export type SlotSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; failure: Failure }
  | { status: "stale" };

const OFFLINE_FAILURE: Failure = {
  reason: "オフラインのため保存できません。",
  hint: "つながったらもう一度押してください。",
  action: "retry",
};

/**
 * 時間割のコマを daily に書く。書けたら手元の daily を差し替えて `onSaved` を呼ぶ。
 *
 * @remarks 何を書くかは持たない。呼び出し側が `src/daily.ts` の関数で `transform` を作る。
 * 手元の sha で書き、競合したら読み直して `transform` を当て直す。
 * 行が変わっていたら `transform` が `SlotChangedError` を投げ、上書きしない。
 * もう入っていたら `transform` が `SlotAlreadySavedError` を投げ、書かずに読み直して `onSaved` を呼ぶ。
 * `transform` の 2 つ目の引数は押したときの daily。再試行で当て直すときに、押した後に増えた分を見分けるのに使う。
 *
 * @param settings - 接続設定。
 * @param date - daily の日付。
 * @param isOnline - オンラインか。
 * @param daily - 今日の daily。`ready` のときだけ書く。
 * @param onSaved - 書けたときに呼ぶ。
 */
export const useSlotSave = (
  settings: Settings,
  date: string,
  isOnline: boolean,
  daily: ReturnType<typeof useDaily>,
  onSaved: () => void,
) => {
  const [save, setSave] = useState<SlotSaveState>({ status: "idle" });
  const isSaving = save.status === "saving";

  const run = (what: string, transform: (current: string, base: string) => string): void => {
    const { state } = daily;
    const isReady = state.status === "ready";
    if (isSaving || !isReady) {
      return;
    }
    if (!isOnline) {
      setSave({ status: "error", failure: OFFLINE_FAILURE });
      return;
    }
    setSave({ status: "saving" });
    const base = state.content;
    writeKnownFile(
      settings,
      dailyPath(date),
      `chore(mobile): ${date} の時間割を${what}`,
      { content: base, sha: state.sha },
      (current) => transform(current, base),
    )
      .then((written) => {
        daily.replace(written.content, written.sha);
        setSave({ status: "idle" });
        onSaved();
      })
      .catch((error: unknown) => {
        const isAlreadySaved = error instanceof SlotAlreadySavedError;
        const isChanged = error instanceof SlotChangedError;
        if (isAlreadySaved) {
          daily.reload();
          setSave({ status: "idle" });
          onSaved();
          return;
        }
        if (isChanged) {
          setSave({ status: "stale" });
          return;
        }
        setSave({ status: "error", failure: describeFailure(error) });
      });
  };

  return { save, isSaving, run };
};
