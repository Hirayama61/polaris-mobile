import type { Segment } from "./projects";

/**
 * 質問とタスクの本文の URL と `owner/name#N` をリンクに分ける。
 *
 * @remarks Markdown の描画は持たない。`#N` だけの参照は repo が決まらないので文字のまま。
 */

type LinkSegment = Extract<Segment, { kind: "link" }>;

// URL は https だけ。javascript: などを開かせないため。全角の句読点と括弧で URL を切る。
// owner/name は GitHub の名前に使える文字だけ。URL に埋めるので他の文字を通さない。
const TEXT_LINK_PATTERN =
  /(https:\/\/[^\s<>"'`、。，．）」』】]+)|(?<![\w./-])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)(?!\w)/g;
// 文の終わりの記号は URL に含めない。
const URL_TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;
const ISSUE_REF_PATTERN = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)$/;
const ISSUE_URL_PATTERN =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(?:issues|pull)\/(\d+)\/?$/;

const toIssueLink = (repo: string, issueNumber: string): LinkSegment => ({
  kind: "link",
  text: `${repo}#${issueNumber}`,
  href: `https://github.com/${repo}/issues/${issueNumber}`,
});

const appendText = (segments: Segment[], value: string): void => {
  const last = segments.at(-1);
  if (value === "") {
    return;
  }
  if (last?.kind === "text") {
    last.text += value;
    return;
  }
  segments.push({ kind: "text", text: value });
};

/**
 * 本文の `https://` の URL と `owner/name#N` をリンクにする。
 *
 * @param text - 本文。改行を含んでよい。
 * @returns 文字とリンクの並び。`owner/name#N` は GitHub の Issue の URL を指す (PR なら GitHub が転送する)。
 */
export const linkifyText = (text: string): Segment[] => {
  const segments: Segment[] = [];
  let rest = 0;
  for (const match of text.matchAll(TEXT_LINK_PATTERN)) {
    const [whole, rawUrl, repo, issueNumber] = match;
    appendText(segments, text.slice(rest, match.index));
    const isUrl = rawUrl !== undefined;
    if (isUrl) {
      const url = rawUrl.replace(URL_TRAILING_PUNCTUATION, "");
      segments.push({ kind: "link", text: url, href: url });
      appendText(segments, rawUrl.slice(url.length));
    } else if (repo !== undefined && issueNumber !== undefined) {
      segments.push(toIssueLink(repo, issueNumber));
    }
    rest = match.index + whole.length;
  }
  appendText(segments, text.slice(rest));
  return segments;
};

/**
 * frontmatter の `issue:` の値を Issue へのリンクにする。
 *
 * @param value - `owner/name#N` か `https://github.com/owner/name/issues/N` (`pull/N` も可)。
 * @returns 読めない形 (番号だけなど) や値が無いときは undefined。
 */
export const getIssueLink = (value: string | undefined): LinkSegment | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const match = ISSUE_REF_PATTERN.exec(value) ?? ISSUE_URL_PATTERN.exec(value);
  const repo = match?.[1];
  const issueNumber = match?.[2];
  if (repo === undefined || issueNumber === undefined) {
    return undefined;
  }
  return toIssueLink(repo, issueNumber);
};
