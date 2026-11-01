import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";

/**
 * PUT で送られた本文。`content` は base64 を解いた UTF-8。`status` は返した応答で、409 なら書き込んでいない。
 */
export type Put = {
  path: string;
  message: string;
  content: string;
  sha: string | undefined;
  status: 200 | 409;
};

const CONTENTS = /^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/;
const TREE = /^\/repos\/[^/]+\/[^/]+\/git\/trees\//;
const BLOB = /^\/repos\/[^/]+\/[^/]+\/git\/blobs\/(.+)$/;

const decodeBase64 = (encoded: string): string => Buffer.from(encoded, "base64").toString("utf8");

const encodeBase64 = (text: string): string => Buffer.from(text, "utf8").toString("base64");

// git と同じく本文から決まる blob sha。本文が変われば sha も変わる。
const toBlobSha = (content: string): string =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0${content}`)
    .digest("hex");

/**
 * api.github.com の Contents API と Git Trees / Blobs API をメモリ上のファイルで置き換える。登録の無いパスは 404。
 * ファイルではなく、その下にファイルがあるパスはディレクトリとして直下のファイル名を返す。
 * tree は全ファイルを切り詰めずに返し、blob sha は本文から決める。
 *
 * @param page - 対象のページ。
 * @param files - リポジトリ内のパスから本文への対応。PUT で書き換わる。
 * @param conflicts - 最初の何回の PUT を 409 (sha の不一致) で断るか。断った PUT は書き込まない。
 * @returns 受けた PUT の記録。409 で断ったものも含む。
 */
export const mockGitHub = async (page: Page, files: Map<string, string>, conflicts = 0): Promise<Put[]> => {
  const puts: Put[] = [];
  let revision = 0;
  let remainingConflicts = conflicts;
  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (TREE.test(pathname)) {
      const tree = [...files].map(([path, content]) => ({ type: "blob", path, sha: toBlobSha(content) }));
      await route.fulfill({ json: { truncated: false, tree } });
      return;
    }
    const blob = BLOB.exec(pathname);
    if (blob !== null) {
      const found = [...files.values()].find((content) => toBlobSha(content) === blob[1]);
      await route.fulfill(
        found === undefined
          ? { status: 404, json: { message: "Not Found" } }
          : { body: found, contentType: "text/plain; charset=utf-8" },
      );
      return;
    }
    const match = CONTENTS.exec(pathname);
    const path = match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
    if (path === undefined) {
      await route.fulfill({ status: 404, json: { message: "Not Found" } });
      return;
    }
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { message: string; content: string; sha?: string };
      const content = decodeBase64(body.content);
      if (remainingConflicts > 0) {
        remainingConflicts -= 1;
        puts.push({ path, message: body.message, content, sha: body.sha, status: 409 });
        await route.fulfill({ status: 409, json: { message: "is at sha-0 but expected sha" } });
        return;
      }
      puts.push({ path, message: body.message, content, sha: body.sha, status: 200 });
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
        : { json: { sha: `sha-${revision}`, content: encodeBase64(content), encoding: "base64" } },
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
