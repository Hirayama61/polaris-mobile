/**
 * 一覧の 1 件と、React の key に使う値。
 */
export type Keyed<T> = { key: string; item: T };

/**
 * 一覧の各要素に key を付ける。同じ値が並んだら出現回数を足して重ならないようにする。
 *
 * @remarks 並べ替えはしない。id を持たない読み取り専用の一覧に使う。
 * @param items - 並べる要素。
 * @param toBase - 要素から key の元になる文字列を作る。
 * @returns 元の順の要素と key。
 */
export const toKeyedItems = <T>(items: readonly T[], toBase: (item: T) => string): Keyed<T>[] => {
  const counts = new Map<string, number>();
  return items.map((item) => {
    const base = toBase(item);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    const key = count === 1 ? base : `${base}#${count}`;
    return { key, item };
  });
};
