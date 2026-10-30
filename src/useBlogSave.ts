import { useState } from "react";
import { describeFailure, type Failure } from "./failure";
import { updateFile } from "./github";
import { OFFLINE_SAVE_FAILURE } from "./screens/common";
import type { Settings } from "./settings";

export type BlogSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; failure: Failure };

/**
 * ブログのファイルを 1 つ書き換える。保存中は次の保存を受け付けない。
 *
 * @remarks 何を書くかは持たない。呼ぶ側が `transform` で決める。
 */
export const useBlogSave = (
  settings: Settings,
  isOnline: boolean,
  onSaved: () => void,
): {
  state: BlogSaveState;
  save: (path: string, message: string, transform: (current: string) => string) => void;
} => {
  const [state, setState] = useState<BlogSaveState>({ status: "idle" });

  const save = (path: string, message: string, transform: (current: string) => string): void => {
    if (state.status === "saving") {
      return;
    }
    if (!isOnline) {
      setState({ status: "error", failure: OFFLINE_SAVE_FAILURE });
      return;
    }
    setState({ status: "saving" });
    // 消えたファイルを書き直すと、一言だけのファイルができてしまう。
    const transformExisting = (current: string | undefined): string => {
      if (current === undefined) {
        throw new Error("ファイルが見つかりません。一覧を読み直してください。");
      }
      return transform(current);
    };
    updateFile(settings, path, message, transformExisting)
      .then(() => {
        setState({ status: "saved" });
        onSaved();
      })
      .catch((error: unknown) => setState({ status: "error", failure: describeFailure(error) }));
  };

  return { state, save };
};
