import { useEffect, useState } from "react";

/**
 * ブラウザのオンライン状態を追う。
 *
 * @returns `navigator.onLine` の現在値。`online` / `offline` イベントで更新する。
 */
export const useOnline = (): boolean => {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = (): void => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return isOnline;
};
