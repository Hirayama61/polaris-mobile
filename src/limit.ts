/**
 * 同時に走らせる非同期処理の数を絞る。
 */

/**
 * 同時実行数を `limit` に絞った実行口を作る。超えた分は先に来た順に待たせる。
 *
 * @param limit - 同時に走らせる数。1 以上。
 * @returns 処理を受け取り、その結果を返す関数。
 */
export const createLimiter = (limit: number): (<T>(task: () => Promise<T>) => Promise<T>) => {
  let running = 0;
  const waiting: (() => void)[] = [];
  const release = (): void => {
    running -= 1;
    const next = waiting.shift();
    if (next !== undefined) {
      next();
    }
  };
  const acquire = async (): Promise<void> => {
    const isFull = running >= limit;
    if (isFull) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running += 1;
  };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
};
