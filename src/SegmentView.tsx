import { toKeyedItems } from "./keys";
import type { Segment } from "./projects";

const toSegmentKey = (segment: Segment): string => {
  const isLink = segment.kind === "link";
  if (isLink) {
    return `link:${segment.href}:${segment.text}`;
  }
  return `text:${segment.text}`;
};

/**
 * 本文の行の一部を描画する。`link` は別のタブで開く。
 *
 * @remarks key は持たない。並べる側 (`SegmentsView`) が付ける。
 */
export const SegmentView = (props: { segment: Segment }) => {
  const { segment } = props;
  const isLink = segment.kind === "link";
  if (isLink) {
    return (
      <a href={segment.href} target="_blank" rel="noreferrer">
        {segment.text}
      </a>
    );
  }
  return <span>{segment.text}</span>;
};

/**
 * 文字とリンクの並びを描画する。
 *
 * @remarks 分け方は持たない。呼ぶ側が `linkifyText` などで分けて渡す。
 */
export const SegmentsView = (props: { segments: readonly Segment[] }) => {
  const { segments } = props;
  return (
    <>
      {toKeyedItems(segments, toSegmentKey).map(({ key, item }) => (
        <SegmentView key={key} segment={item} />
      ))}
    </>
  );
};
