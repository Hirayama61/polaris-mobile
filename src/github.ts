import { loadBlob, saveBlob } from "./blobCache";
import { createLimiter } from "./limit";
import type { Settings } from "./settings";
import { getFileNamesIn, type RepoTree, toRepoTree } from "./tree";

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

// GET は ETag で条件付きに問い合わせる。304 はレート制限に数えられず、古い内容も返さない。
const GET_CACHE: RequestCache = "no-cache";

// GitHub の二次制限 (同時 100 リクエスト超) より十分少なくする。
const READ_CONCURRENCY = 6;

const limitRead = createLimiter(READ_CONCURRENCY);

// 画面を切り替えるたびの読み直しで tree を取り直さないよう、この間は同じ tree を使い回す。
// 他の端末での変更はこの分だけ遅れて見える。このアプリからの書き込みでは捨てる。
const TREE_REUSE_MS = 30_000;

type SharedTree = { key: string; fetchedAt: number; tree: Promise<RepoTree> };

let sharedTree: SharedTree | undefined;

const forgetTree = (): void => {
  sharedTree = undefined;
};

// 同じ blob を別の画面が同時に読みにいったとき、リクエストを 1 本にまとめる。
const pendingBlobs = new Map<string, Promise<string>>();

const repoUrl = (settings: Settings): string =>
  `${API_BASE}/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`;

const contentsUrl = (settings: Settings, path: string): string => {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${repoUrl(settings)}/contents/${encodedPath}`;
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

const decodeBase64 = (encoded: string): string => {
  const binary = atob(encoded.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const readBase64Content = (body: unknown): string | undefined => {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const source: Record<string, unknown> = { ...body };
  const { encoding, content } = source;
  if (encoding !== "base64" || typeof content !== "string") {
    return undefined;
  }
  return decodeBase64(content);
};

const readBlobText = async (settings: Settings, sha: string): Promise<string> => {
  const response = await request(`${repoUrl(settings)}/git/blobs/${encodeURIComponent(sha)}`, {
    headers: headers(settings, "application/vnd.github.raw+json"),
    cache: GET_CACHE,
  });
  if (!response.ok) {
    throw new GitHubError(response.status, await describeError(response));
  }
  return response.text();
};

/**
 * ファイルを読む。本文と sha を Contents API の JSON 1 回で取る。
 *
 * 1 MB を超えるファイルは JSON に本文が載らないので、そのときだけ blob を読み足す。
 *
 * @param settings - 接続設定。
 * @param path - リポジトリ内のパス。
 * @returns ファイルが無ければ `missing`。
 * @throws GitHubError 404 以外の失敗。
 */
export const readFile = async (settings: Settings, path: string): Promise<RemoteFile> => {
  const url = `${contentsUrl(settings, path)}?ref=${encodeURIComponent(settings.branch)}`;
  const response = await request(url, {
    headers: headers(settings, "application/vnd.github+json"),
    cache: GET_CACHE,
  });
  if (response.status === 404) {
    return { kind: "missing" };
  }
  if (!response.ok) {
    throw new GitHubError(response.status, await describeError(response));
  }
  const body: unknown = await response.json();
  const sha = readSha(body);
  const content = readBase64Content(body) ?? (await readBlobText(settings, sha));
  return { kind: "found", content, sha };
};

const putFile = async (
  settings: Settings,
  path: string,
  content: string,
  message: string,
  sha: string | undefined,
): Promise<WriteOutcome> => {
  // 書き込みの最中に読んだ tree も書き込み前のものなので、終わった後にも捨てる。
  forgetTree();
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
  }).finally(forgetTree);
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
    cache: GET_CACHE,
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
    cache: GET_CACHE,
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new GitHubError(response.status, await describeError(response));
  }
  return response.text();
};

const readTree = async (settings: Settings): Promise<RepoTree> => {
  const url = `${repoUrl(settings)}/git/trees/${encodeURIComponent(settings.branch)}?recursive=1`;
  const response = await request(url, {
    headers: headers(settings, "application/vnd.github+json"),
    cache: GET_CACHE,
  });
  // Contents API の一覧と同じく、ブランチやリポジトリが見えなければ空として扱う。
  if (response.status === 404) {
    return toRepoTree({ tree: [] });
  }
  if (!response.ok) {
    throw new GitHubError(response.status, await describeError(response));
  }
  return toRepoTree(await response.json());
};

const getSharedTree = (settings: Settings): Promise<RepoTree> => {
  const key = [settings.token, settings.owner, settings.repo, settings.branch].join("\n");
  const now = Date.now();
  const isReusable =
    sharedTree !== undefined && sharedTree.key === key && now - sharedTree.fetchedAt < TREE_REUSE_MS;
  if (isReusable && sharedTree !== undefined) {
    return sharedTree.tree;
  }
  const tree = readTree(settings);
  const entry: SharedTree = { key, fetchedAt: now, tree };
  sharedTree = entry;
  tree.catch(() => {
    if (sharedTree === entry) {
      forgetTree();
    }
  });
  return tree;
};

const fetchBlob = async (settings: Settings, sha: string): Promise<string> => {
  const content = await limitRead(() => readBlobText(settings, sha));
  saveBlob(sha, content);
  return content;
};

const readCachedBlob = (settings: Settings, sha: string): Promise<string> => {
  const cached = loadBlob(sha);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  const pending = pendingBlobs.get(sha) ?? fetchBlob(settings, sha);
  pendingBlobs.set(sha, pending);
  const forget = (): void => {
    pendingBlobs.delete(sha);
  };
  pending.then(forget, forget);
  return pending;
};

/**
 * 一覧と本文を読む口。書き込み前の読み取りには使わない (sha は `readFile` で取る)。
 */
export type RepoReader = {
  listFileNames: (dir: string) => Promise<string[]>;
  readText: (path: string) => Promise<string | undefined>;
};

/**
 * 1 回の画面表示ぶんの読み取り口を作る。
 *
 * 最初の呼び出しで Git Trees を読み、全ファイルの blob sha を得る。30 秒以内に読んだ tree があれば使い回す。
 * 本文は sha をキーに localStorage へ置き、sha が変わっていなければ読み直さない。
 * tree が切り詰められていたら Contents API に落とす。本文の読み取りは全体で同時 6 件まで。
 *
 * @remarks 作った後の変更は見えない。画面を読み直すたびに作り直す。
 * @param settings - 接続設定。
 * @returns 一覧と本文を読む関数。
 * @throws GitHubError 読めなかったとき (各関数が投げる)。
 */
export const createRepoReader = (settings: Settings): RepoReader => {
  let tree: Promise<RepoTree> | undefined;
  const getTree = (): Promise<RepoTree> => {
    tree ??= getSharedTree(settings);
    return tree;
  };
  return {
    listFileNames: async (dir) => {
      const current = await getTree();
      if (current.kind === "truncated") {
        return listFileNames(settings, dir);
      }
      return getFileNamesIn(current.shas, dir);
    },
    readText: async (path) => {
      const current = await getTree();
      if (current.kind === "truncated") {
        return limitRead(() => readText(settings, path));
      }
      const sha = current.shas.get(path);
      if (sha === undefined) {
        return undefined;
      }
      return readCachedBlob(settings, sha);
    },
  };
};

/**
 * 他のリポジトリの Issue の 1 件。PR は含めない。
 */
export type RepoIssue = { number: number; title: string; closedAt: string | undefined };

const getRepoJson = async (settings: Settings, repo: string, pathAndQuery: string): Promise<unknown> => {
  const encodedRepo = repo.split("/").map(encodeURIComponent).join("/");
  const response = await request(`${API_BASE}/repos/${encodedRepo}/${pathAndQuery}`, {
    headers: headers(settings, "application/vnd.github+json"),
    cache: GET_CACHE,
  });
  if (!response.ok) {
    throw new GitHubError(response.status, await describeError(response));
  }
  return response.json();
};

type IssueEntry = { number: number; title: string; closed_at?: unknown; labels?: unknown };

type PullEntry = { head: { ref: string } };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isIssueEntry = (entry: unknown): entry is IssueEntry => {
  if (!isRecord(entry)) {
    return false;
  }
  const isPull = "pull_request" in entry;
  const hasNumber = typeof entry.number === "number";
  const hasTitle = typeof entry.title === "string";
  return !isPull && hasNumber && hasTitle;
};

const hasHeadRef = (entry: unknown): entry is PullEntry => {
  if (!isRecord(entry) || !isRecord(entry.head)) {
    return false;
  }
  const hasRef = typeof entry.head.ref === "string";
  return hasRef;
};

const getClosedAt = (entry: IssueEntry): string | undefined => {
  const { closed_at: closedAt } = entry;
  const hasClosedAt = typeof closedAt === "string";
  if (!hasClosedAt) {
    return undefined;
  }
  return closedAt;
};

const toRepoIssue = (entry: IssueEntry): RepoIssue => ({
  number: entry.number,
  title: entry.title,
  closedAt: getClosedAt(entry),
});

const toRepoIssues = (body: unknown): RepoIssue[] => {
  if (!Array.isArray(body)) {
    return [];
  }
  return body.filter(isIssueEntry).map(toRepoIssue);
};

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
  return body.filter(hasHeadRef).map((entry) => entry.head.ref);
};

/**
 * 他のリポジトリの open の Issue の 1 件。PR は含めない。
 */
export type RepoOpenIssue = { number: number; title: string; labels: string[] };

type MergedPullEntry = { merged_at: string };

const toLabelName = (label: unknown): string | undefined => {
  if (!isRecord(label)) {
    return undefined;
  }
  const { name } = label;
  const hasName = typeof name === "string";
  if (!hasName) {
    return undefined;
  }
  return name;
};

const getLabelNames = (entry: IssueEntry): string[] => {
  const { labels } = entry;
  if (!Array.isArray(labels)) {
    return [];
  }
  return labels.map(toLabelName).filter((name) => name !== undefined);
};

const toRepoOpenIssue = (entry: IssueEntry): RepoOpenIssue => ({
  number: entry.number,
  title: entry.title,
  labels: getLabelNames(entry),
});

const hasMergedAt = (entry: unknown): entry is MergedPullEntry => {
  if (!isRecord(entry)) {
    return false;
  }
  const isMerged = typeof entry.merged_at === "string";
  return isMerged;
};

/**
 * open の Issue をラベル付きで読む。100 件を超える分は読まない。
 *
 * @param settings - 接続設定。トークンだけを使う。
 * @param repo - `owner/name`。
 * @returns PR を除いた Issue。
 * @throws GitHubError 読めなかったとき。
 */
export const listOpenIssues = async (settings: Settings, repo: string): Promise<RepoOpenIssue[]> => {
  const body = await getRepoJson(settings, repo, "issues?state=open&per_page=100");
  if (!Array.isArray(body)) {
    return [];
  }
  return body.filter(isIssueEntry).map(toRepoOpenIssue);
};

/**
 * 最近更新された closed の PR のうち、マージされたもののマージ日時を読む。100 件を超える分は読まない。
 *
 * @param settings - 接続設定。トークンだけを使う。
 * @param repo - `owner/name`。
 * @returns ISO 8601 の日時。期間での絞り込みは呼ぶ側がする。
 * @throws GitHubError 読めなかったとき。
 */
export const listMergedPullDates = async (settings: Settings, repo: string): Promise<string[]> => {
  const body = await getRepoJson(
    settings,
    repo,
    "pulls?state=closed&sort=updated&direction=desc&per_page=100",
  );
  if (!Array.isArray(body)) {
    return [];
  }
  return body.filter(hasMergedAt).map((entry) => entry.merged_at);
};
