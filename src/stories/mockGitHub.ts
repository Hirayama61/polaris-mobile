/**
 * Storybook で GitHub の Contents API と Git Trees / Blobs API を差し替える。部品が fetch する前に呼ぶ。
 */

type MockFile =
  | { status: 200; content: string }
  | { status: 200; names: readonly string[] }
  | { status: 404 | 401 | 500 }
  | { status: "pending" };

const CONTENTS = /^\/repos\/[^/]+\/[^/]+\/contents\//;
const TREE = /^\/repos\/[^/]+\/[^/]+\/git\/trees\//;
const BLOB = /^\/repos\/[^/]+\/[^/]+\/git\/blobs\/(.+)$/;

const encodeBase64 = (text: string): string =>
  btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));

// 本文が変われば sha も変わるようにする。story をまたいで localStorage の blob キャッシュが残るため。
const toMockSha = (path: string, content: string | undefined): string => {
  let hash = 2166136261;
  for (const char of `${path}\n${content ?? "\u0000missing"}`) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619) >>> 0;
  }
  return `mock-${hash.toString(16)}`;
};

const getContent = (file: MockFile | undefined): string | undefined =>
  file !== undefined && file.status === 200 && "content" in file ? file.content : undefined;

// 一覧が登録されたファイルだけを tree に載せる。読めない応答が 1 つでもあれば Contents API に落とさせる。
const toTreeBody = (files: Record<string, MockFile>): unknown => {
  const hasFailure = Object.values(files).some((file) => file.status !== 200);
  if (hasFailure) {
    return { truncated: true, tree: [] };
  }
  const paths = Object.entries(files).flatMap(([dir, file]) =>
    "names" in file ? file.names.map((name) => `${dir}/${name}`) : [],
  );
  const tree = paths.map((path) => ({ type: "blob", path, sha: toMockSha(path, getContent(files[path])) }));
  return { truncated: false, tree };
};

/**
 * パスごとの応答を決めて `fetch` を差し替える。登録の無いパスは 404。`names` はディレクトリの一覧として返す。
 *
 * @param files - リポジトリ内のパスから応答への対応。
 * @returns 元の `fetch` に戻す関数。story の `beforeEach` から返す。
 */
export const mockGitHub = (files: Record<string, MockFile>): (() => void) => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (TREE.test(url.pathname)) {
      return Response.json(toTreeBody(files));
    }
    const blob = BLOB.exec(url.pathname);
    if (blob !== null) {
      const tree = toTreeBody(files) as { tree: { path: string; sha: string }[] };
      const entry = tree.tree.find((item) => item.sha === decodeURIComponent(blob[1] ?? ""));
      const content = entry === undefined ? undefined : getContent(files[entry.path]);
      return content === undefined
        ? Response.json({ message: "mocked" }, { status: 404 })
        : new Response(content);
    }
    const path = decodeURIComponent(url.pathname.replace(CONTENTS, ""));
    const file = files[path] ?? { status: 404 };
    if (file.status === "pending") {
      return new Promise<Response>(() => {});
    }
    if (file.status !== 200) {
      return Response.json({ message: "mocked" }, { status: file.status });
    }
    if ("names" in file) {
      return Response.json(file.names.map((name) => ({ type: "file", name })));
    }
    if (init?.method === "PUT") {
      return Response.json({ content: { sha: "sha-after" } });
    }
    const accept = new Headers(init?.headers).get("Accept") ?? "";
    return accept.includes("raw")
      ? new Response(file.content)
      : Response.json({ sha: "sha-before", content: encodeBase64(file.content), encoding: "base64" });
  };
  return () => {
    globalThis.fetch = original;
  };
};
