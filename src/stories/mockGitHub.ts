/**
 * Storybook で GitHub Contents API を差し替える。部品が fetch する前に呼ぶ。
 */

type MockFile =
  | { status: 200; content: string }
  | { status: 200; names: readonly string[] }
  | { status: 404 | 401 | 500 }
  | { status: "pending" };

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
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ""));
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
    return accept.includes("raw") ? new Response(file.content) : Response.json({ sha: "sha-before" });
  };
  return () => {
    globalThis.fetch = original;
  };
};
