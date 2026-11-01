/**
 * 本番ビルドの index.html に置く Content-Security-Policy。
 * GitHub Pages は独自ヘッダを付けられないので meta で置く。
 * 通信先だけを api.github.com に絞り、PAT を他の宛先へ送れないようにする。
 */
export const CONTENT_SECURITY_POLICY = "connect-src 'self' https://api.github.com";

/** Storybook の静的ビルドから外すときに名前で見分ける。 */
export const CSP_PLUGIN_NAME = "polaris-csp";

/**
 * CSP の meta を Vite の `transformIndexHtml` が受け取る形で返す。
 *
 * @returns `<head>` の先頭に入れる meta の記述。スクリプトより前に置かないと先に読まれた分に効かない。
 */
export const getCspMetaTag = () => ({
  tag: "meta",
  attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
  injectTo: "head-prepend" as const,
});
