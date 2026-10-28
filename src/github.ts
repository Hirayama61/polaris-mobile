import type { Settings } from "./settings";

/**
 * GitHub Contents API のエラー。`status` は HTTP ステータス。ネットワーク到達前の失敗は 0。
 */
export class GitHubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

/**
 * リポジトリから読んだファイル。
 */
export type RemoteFile =
  | { kind: "found"; content: string; sha: string }
  | { kind: "missing" };

type WriteOutcome = { sha: string };

const API_BASE = "https://api.github.com";

const contentsUrl = (settings: Settings, path: string): string => {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${API_BASE}/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${encodedPath}`;
};

const headers = (settings: Settings, accept: string): HeadersInit => ({
  Accept: accept,
  Authorization: `Bearer ${settings.token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

const describeError = async (response: Response): Promise<string> => {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "message" in body) {
      const { message } = body;
      if (typeof message === "string") {
        return `${response.status}: ${message}`;
      }
    }
  } catch {
    // JSON でなければステータスだけを返す。
  }
  return fallback;
};

const request = async (input: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new GitHubError(0, `GitHub に接続できません (${reason})`);
  }
};

const readSha = (body: unknown): string => {
  if (typeof body === "object" && body !== null && "sha" in body) {
    const { sha } = body;
    if (typeof sha === "string") {
      return sha;
    }
  }
  throw new GitHubError(0, "GitHub の応答に sha がありません");
};

const encodeBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

/**
 * ファイルを読む。本文は raw で、sha は JSON で別々に取得する。
 *
 * @param settings - 接続設定。
 * @param path - リポジトリ内のパス。
 * @returns ファイルが無ければ `missing`。
 * @throws GitHubError 404 以外の失敗。
 */
export const readFile = async (
  settings: Settings,
  path: string,
): Promise<RemoteFile> => {
  const url = `${contentsUrl(settings, path)}?ref=${encodeURIComponent(settings.branch)}`;
  const [rawResponse, jsonResponse] = await Promise.all([
    request(url, {
      headers: headers(settings, "application/vnd.github.raw+json"),
      cache: "no-store",
    }),
    request(url, {
      headers: headers(settings, "application/vnd.github+json"),
      cache: "no-store",
    }),
  ]);
  if (rawResponse.status === 404 || jsonResponse.status === 404) {
    return { kind: "missing" };
  }
  if (!rawResponse.ok) {
    throw new GitHubError(rawResponse.status, await describeError(rawResponse));
  }
  if (!jsonResponse.ok) {
    throw new GitHubError(jsonResponse.status, await describeError(jsonResponse));
  }
  const [content, json] = await Promise.all([
    rawResponse.text(),
    jsonResponse.json() as Promise<unknown>,
  ]);
  return { kind: "found", content, sha: readSha(json) };
};

const putFile = async (
  settings: Settings,
  path: string,
  content: string,
  message: string,
  sha: string | undefined,
): Promise<WriteOutcome> => {
  const response = await request(contentsUrl(settings, path), {
    method: "PUT",
    headers: {
      ...headers(settings, "application/vnd.github+json"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: encodeBase64(content),
      branch: settings.branch,
      ...(sha === undefined ? {} : { sha }),
    }),
  });
  if (!response.ok) {
    throw new GitHubError(response.status, await describeError(response));
  }
  const body: unknown = await response.json();
  if (typeof body === "object" && body !== null && "content" in body) {
    return { sha: readSha(body.content) };
  }
  throw new GitHubError(0, "GitHub の応答に content がありません");
};

// sha 不一致は 409 で返る。古い API は 422 を返したので両方を競合とみなす。
const isConflict = (error: unknown): boolean =>
  error instanceof GitHubError && (error.status === 409 || error.status === 422);

/**
 * ファイルを読み、変換した内容を楽観ロックつきで書く。
 *
 * 競合(409 / 422)したら読み直して 1 回だけやり直す。
 *
 * @param settings - 接続設定。
 * @param path - リポジトリ内のパス。
 * @param message - commit メッセージ。
 * @param transform - 現在の内容(無ければ undefined)から書く内容を作る。
 * @returns 書いた内容と新しい sha。
 * @throws GitHubError 2 回目も失敗したとき、または競合以外の失敗。
 */
export const updateFile = async (
  settings: Settings,
  path: string,
  message: string,
  transform: (current: string | undefined) => string,
): Promise<{ content: string; sha: string }> => {
  const attempt = async (): Promise<{ content: string; sha: string }> => {
    const current = await readFile(settings, path);
    const content = transform(
      current.kind === "found" ? current.content : undefined,
    );
    const outcome = await putFile(
      settings,
      path,
      content,
      message,
      current.kind === "found" ? current.sha : undefined,
    );
    return { content, sha: outcome.sha };
  };
  try {
    return await attempt();
  } catch (error) {
    if (!isConflict(error)) {
      throw error;
    }
    return attempt();
  }
};

/**
 * 手元に sha があるファイルを楽観ロックつきで書く。
 *
 * 競合したら読み直して `transform` を当て直し、1 回だけやり直す。
 *
 * @param settings - 接続設定。
 * @param path - リポジトリ内のパス。
 * @param message - commit メッセージ。
 * @param known - 手元の内容と sha。
 * @param transform - 内容を変換する純粋関数。やり直し時にはリモートの最新内容に当てる。
 * @returns 書いた内容と新しい sha。
 * @throws GitHubError 2 回目も失敗したとき、または競合以外の失敗。
 */
export const writeKnownFile = async (
  settings: Settings,
  path: string,
  message: string,
  known: { content: string; sha: string },
  transform: (current: string) => string,
): Promise<{ content: string; sha: string }> => {
  const content = transform(known.content);
  try {
    const outcome = await putFile(settings, path, content, message, known.sha);
    return { content, sha: outcome.sha };
  } catch (error) {
    if (!isConflict(error)) {
      throw error;
    }
    return updateFile(settings, path, message, (current) =>
      transform(current ?? known.content),
    );
  }
};
