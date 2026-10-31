/**
 * タスクと質問の詳細の上部に出す、元の Issue へのリンク。別のタブで開く。
 *
 * @remarks `issue:` の読み取りは持たない。呼ぶ側が `getIssueLink` で作って渡す。
 */
export const IssueLink = (props: { href: string; label: string }) => {
  const { href, label } = props;
  return (
    <a className="issue-link" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
};
