import type { Page } from "@playwright/test";

/**
 * PUT で送られた本文。`content` は base64 を解いた UTF-8。
 */
export type Put = { path: string; message: string; content: string; sha: string | undefined };

const CONTENTS = /^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/;

const decodeBase64 = (encoded: string): string => Buffer.from(encoded, "base64").toString("utf8");

/**
 * api.github.com の Contents API をメモリ上のファイルで置き換える。登録の無いパスは 404。
 * ファイルではなく、その下にファイルがあるパスはディレクトリとして直下のファイル名を返す。
 *
 * @param page - 対象のページ。
 * @param files - リポジトリ内のパスから本文への対応。PUT で書き換わる。
 * @returns 受けた PUT の記録。
 */
export const mockGitHub = async (page: Page, files: Map<string, string>): Promise<Put[]> => {
  const puts: Put[] = [];
  let revision = 0;
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const match = CONTENTS.exec(new URL(request.url()).pathname);
    const path = match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
    if (path === undefined) {
      await route.fulfill({ status: 404, json: { message: "Not Found" } });
      return;
    }
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { message: string; content: string; sha?: string };
      const content = decodeBase64(body.content);
      puts.push({ path, message: body.message, content, sha: body.sha });
      files.set(path, content);
      revision += 1;
      await route.fulfill({ json: { content: { sha: `sha-${revision}` } } });
      return;
    }
    const content = files.get(path);
    const names = [...files.keys()]
      .filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
      .map((key) => key.slice(path.length + 1));
    if (content === undefined && names.length > 0) {
      await route.fulfill({ json: names.map((name) => ({ type: "file", name })) });
      return;
    }
    if (content === undefined) {
      await route.fulfill({ status: 404, json: { message: "Not Found" } });
      return;
    }
    const accept = request.headers().accept ?? "";
    await route.fulfill(
      accept.includes("raw")
        ? { body: content, contentType: "text/plain; charset=utf-8" }
        : { json: { sha: `sha-${revision}` } },
    );
  });
  return puts;
};

/**
 * PAT の代わりにダミーの値を設定済みにする。実際の PAT は使わない。
 *
 * @param page - 対象のページ。
 */
export const configure = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "polaris-mobile:settings",
      JSON.stringify({ token: "e2e-dummy", owner: "owner", repo: "polaris-data", branch: "main" }),
    );
  });
};
