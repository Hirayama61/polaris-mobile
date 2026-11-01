/**
 * 振り返りの入力が daily に書いてある振り返りから変わったかを判定する。
 *
 * @param review - 入力欄の振り返り。
 * @param existingReview - daily に書いてある振り返り。
 * @returns 前後の空白を除いて違えば true。全部消した場合も変更として扱い、空の振り返りを保存できるようにする。
 * @remarks 保存できるかどうかの他の条件 (保存中、読み込み中、日記の有無) は持たない。呼び出し側が決める。
 */
export const isReviewChanged = (review: string, existingReview: string): boolean =>
  review.trim() !== existingReview.trim();

/**
 * 振り返りの見出しの横に「保存済み」を出してよいかを判定する。
 *
 * @param existingReview - daily に書いてある振り返り。
 * @returns 書いてある振り返りがあれば true。空の振り返りの横に「保存済み」だけが出ないようにする。
 * @remarks 保存した時刻の取り出しと文言は持たない。
 */
export const hasSavedReview = (existingReview: string): boolean => existingReview.trim() !== "";
