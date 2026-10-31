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
export type RemoteFile = { kind: "found"; content: string; sha: string } | { kind: "missing" };

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
export const readFile = async (settings: Settings, path: string): Promise<RemoteFile> => {
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
  const [content, json] = await Promise.all([rawResponse.text(), jsonResponse.json() as Promise<unknown>]);
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

/**
 * 書き込みが競合 (sha の不一致) で失敗したかを返す。
 *
 * sha 不一致は 409 で返る。古い API は 422 を返したので両方を競合とみなす。
 *
 * @param error - 書き込みで起きた例外。
 * @returns 競合なら true。
 */
export const isConflict = (error: unknown): boolean =>
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
    const content = transform(current.kind === "found" ? current.content : undefined);
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
    return updateFile(settings, path, message, (current) => transform(current ?? known.content));
  }
};

/**
 * 手元の sha のときだけファイルを書く。競合してもやり直さない。
 *
 * @param settings - 接続設定。
 * @param path - リポジトリ内のパス。
 * @param message - commit メッセージ。
 * @param sha - 手元の sha。
 * @param content - 書く内容。
 * @returns 新しい sha。
 * @throws GitHubError 失敗したとき。競合は `isConflict` で見分ける。
 */
export const writeIfUnchanged = async (
  settings: Settings,
  path: string,
  message: string,
  sha: string,
  content: string,
): Promise<{ sha: string }> => putFile(settings, path, content, message, sha);

/**
 * 新しいファイルを作る。同じパスが既にあれば上書きせず失敗する。
 *
 * @param settings - 接続設定。
 * @param path - リポジトリ内のパス。
 * @param content - 書く内容。
 * @param message - commit メッセージ。
 * @throws GitHubError 作成に失敗したとき。既にあれば 422。
 */
export const createFile = async (
  settings: Settings,
  path: string,
  content: string,
  message: string,
): Promise<void> => {
  await putFile(settings, path, content, message, undefined);
};

/**
 * ディレクトリ直下のファイル名を返す。サブディレクトリは含めない。
 *
 * @param settings - 接続設定。
 * @param path - リポジトリ内のディレクトリのパス。
 * @returns ディレクトリが無ければ空。
 * @throws GitHubError 404 以外の失敗。
 */
export const listFileNames = async (settings: Settings, path: string): Promise<string[]> => {
  const url = `${contentsUrl(settings, path)}?ref=${encodeURIComponent(settings.branch)}`;
  const response = await request(url, {
    headers: headers(settings, "application/vnd.github+json"),
    cache: "no-store",
  });
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new GitHubError(response.status, await describeError(response));
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    return [];
  }
  return body.flatMap((entry: unknown) =>
    typeof entry === "object" &&
    entry !== null &&
    "type" in entry &&
    entry.type === "file" &&
    "name" in entry &&
    typeof entry.name === "string"
      ? [entry.name]
      : [],
  );
};

/**
 * ファイルの本文だけを読む。sha は取らない。
 *
 * @param settings - 接続設定。
 * @param path - リポジトリ内のパス。
 * @returns 本文。無ければ undefined。
 * @throws GitHubError 404 以外の失敗。
 */
export const readText = async (settings: Settings, path: string): Promise<string | undefined> => {
  const url = `${contentsUrl(settings, path)}?ref=${encodeURIComponent(settings.branch)}`;
  const response = await request(url, {
    headers: headers(settings, "application/vnd.github.raw+json"),
    cache: "no-store",
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new GitHubError(response.status, await describeError(response));
  }
  return response.text();
};

/**
 * 他のリポジトリの Issue の 1 件。PR は含めない。
 */
export type RepoIssue = { number: number; title: string; closedAt: string | undefined };

const getRepoJson = async (settings: Settings, repo: string, pathAndQuery: string): Promise<unknown> => {
  const encodedRepo = repo.split("/").map(encodeURIComponent).join("/");
  const response = await request(`${API_BASE}/repos/${encodedRepo}/${pathAndQuery}`, {
    headers: headers(settings, "application/vnd.github+json"),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new GitHubError(response.status, await describeError(response));
  }
  return response.json();
};

const toRepoIssue = (entry: unknown): RepoIssue[] => {
  if (typeof entry !== "object" || entry === null || "pull_request" in entry) {
    return [];
  }
  if (!("number" in entry) || typeof entry.number !== "number") {
    return [];
  }
  if (!("title" in entry) || typeof entry.title !== "string") {
    return [];
  }
  const hasClosedAt = "closed_at" in entry && typeof entry.closed_at === "string";
  const closedAt = hasClosedAt ? String(entry.closed_at) : undefined;
  return [{ number: entry.number, title: entry.title, closedAt }];
};

const toRepoIssues = (body: unknown): RepoIssue[] => (Array.isArray(body) ? body.flatMap(toRepoIssue) : []);

/**
 * open で `ready` の Issue を読む。100 件を超える分は読まない。
 *
 * @param settings - 接続設定。トークンだけを使う。
 * @param repo - `owner/name`。
 * @returns PR を除いた Issue。
 * @throws GitHubError 読めなかったとき。
 */
export const listReadyIssues = async (settings: Settings, repo: string): Promise<RepoIssue[]> =>
  toRepoIssues(await getRepoJson(settings, repo, "issues?state=open&labels=ready&per_page=100"));

/**
 * `since` 以降に更新された closed の Issue を読む。閉じた日時での絞り込みは呼ぶ側がする。
 *
 * @param settings - 接続設定。トークンだけを使う。
 * @param repo - `owner/name`。
 * @param since - ISO 8601 の日時。
 * @returns PR を除いた Issue。
 * @throws GitHubError 読めなかったとき。
 */
export const listIssuesClosedSince = async (
  settings: Settings,
  repo: string,
  since: string,
): Promise<RepoIssue[]> =>
  toRepoIssues(
    await getRepoJson(settings, repo, `issues?state=closed&since=${encodeURIComponent(since)}&per_page=100`),
  );

/**
 * open の PR の head のブランチ名を読む。
 *
 * @param settings - 接続設定。トークンだけを使う。
 * @param repo - `owner/name`。
 * @returns ブランチ名。
 * @throws GitHubError 読めなかったとき。
 */
export const listOpenPullHeadRefs = async (settings: Settings, repo: string): Promise<string[]> => {
  const body = await getRepoJson(settings, repo, "pulls?state=open&per_page=100");
  if (!Array.isArray(body)) {
    return [];
  }
  return body.flatMap((entry: unknown) =>
    typeof entry === "object" &&
    entry !== null &&
    "head" in entry &&
    typeof entry.head === "object" &&
    entry.head !== null &&
    "ref" in entry.head &&
    typeof entry.head.ref === "string"
      ? [entry.head.ref]
      : [],
  );
};
