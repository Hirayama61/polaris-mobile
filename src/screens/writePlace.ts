/**
 * 「今日」の書き込みの対象。チェックは向き (`nextChecked`) も持つ。
 */
export type WriteTarget =
  | { kind: "turn"; line: number; nextChecked: boolean }
  | { kind: "wake" }
  | { kind: "actual"; slot: string };

/**
 * 書き込みの失敗を出す場所。チェックは「あなたの番」の行番号、実績は時間枠のキーで見分ける。
 */
export type WritePlace = { kind: "turn"; line: number } | { kind: "wake" } | { kind: "actual"; slot: string };

/**
 * 書き込みの対象がその場所のものかを判定する。
 *
 * @param target - 書き込んだ (または失敗した) 対象。
 * @param place - 失敗を出すか確かめる場所。
 * @returns 同じ行か、同じ起床なら true。チェックの向きは比べない。
 * @remarks 失敗を出すかどうかだけを決める。失敗の文言と出し方は呼び出し側が持つ。
 */
export const isWriteAt = (target: WriteTarget, place: WritePlace): boolean => {
  const isTurnPair = target.kind === "turn" && place.kind === "turn";
  if (isTurnPair) {
    const isSameLine = target.line === place.line;
    return isSameLine;
  }
  const isActualPair = target.kind === "actual" && place.kind === "actual";
  if (isActualPair) {
    const isSameSlot = target.slot === place.slot;
    return isSameSlot;
  }
  const isWakePair = target.kind === "wake" && place.kind === "wake";
  return isWakePair;
};
