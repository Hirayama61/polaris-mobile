import { useEffect, useMemo, useState } from "react";
import { readFile } from "./github";
import { createProjectNameLoader } from "./projects";
import type { Settings } from "./settings";

/**
 * task ID ごとのプロジェクト名を GitHub から読む。
 *
 * 引けない ID は結果に入らない。読み込み中や失敗でも画面はプロジェクト名なしで出せる。
 *
 * @param settings - 接続設定。
 * @param taskIds - 名前を引く task ID。
 * @returns task ID からプロジェクト名への対応。
 */
export const useProjectNames = (
  settings: Settings,
  taskIds: readonly string[],
): ReadonlyMap<string, string> => {
  const nameOf = useMemo(
    () =>
      createProjectNameLoader(async (path) => {
        const file = await readFile(settings, path);
        return file.kind === "found" ? file.content : undefined;
      }),
    [settings],
  );
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  // 配列は描画ごとに作り直されるので、中身が同じなら読み直さないよう文字列にする。
  const key = [...new Set(taskIds)].sort().join("\n");

  useEffect(() => {
    let isCancelled = false;
    const ids = key === "" ? [] : key.split("\n");
    for (const id of ids) {
      void nameOf(id).then((name) => {
        if (isCancelled || name === undefined) {
          return;
        }
        setNames((current) => (current.get(id) === name ? current : new Map(current).set(id, name)));
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [nameOf, key]);

  return names;
};
