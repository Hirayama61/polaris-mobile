import { useEffect, useState } from "react";
import { polarisToday } from "./clock";
import { NightScreen } from "./screens/Night";
import { SettingsScreen } from "./screens/Settings";
import { TodayScreen } from "./screens/Today";
import { isConfigured, loadSettings, saveSettings, type Settings } from "./settings";
import { useDaily } from "./useDaily";
import { useOnline } from "./useOnline";

const screens = ["today", "night", "settings"] as const;

type Screen = (typeof screens)[number];

const screenLabels = {
  today: "今日",
  night: "夜",
  settings: "設定",
} satisfies Record<Screen, string>;

// 「今日」は端末の日付が変わるか、画面に戻ってきたときに取り直す。
const useToday = (): string => {
  const [today, setToday] = useState(() => polarisToday(new Date()));
  useEffect(() => {
    const update = (): void => {
      if (document.visibilityState === "visible") {
        setToday(polarisToday(new Date()));
      }
    };
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  return today;
};

/**
 * 画面全体。ルーターは使わず、state で 3 画面を切り替える。
 */
export const App = () => {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>(() =>
    isConfigured(loadSettings()) ? "today" : "settings",
  );
  const today = useToday();
  const isOnline = useOnline();
  const daily = useDaily(settings, today);

  const handleSaveSettings = (next: Settings): void => {
    setSettings(saveSettings(next));
    setScreen("today");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Polaris</h1>
        <span className="app-date">{today}</span>
        {!isOnline && <span className="badge badge-offline">オフライン</span>}
      </header>

      <main className="app-main">
        {screen === "today" && (
          <TodayScreen
            settings={settings}
            date={today}
            daily={daily}
            isOnline={isOnline}
            onOpenSettings={() => setScreen("settings")}
          />
        )}
        {screen === "night" && (
          <NightScreen
            settings={settings}
            date={today}
            daily={daily}
            isOnline={isOnline}
            onOpenSettings={() => setScreen("settings")}
          />
        )}
        {screen === "settings" && (
          <SettingsScreen settings={settings} onSave={handleSaveSettings} />
        )}
      </main>

      <nav className="tab-bar" aria-label="画面">
        {screens.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={candidate === screen ? "tab tab-active" : "tab"}
            aria-current={candidate === screen ? "page" : undefined}
            onClick={() => setScreen(candidate)}
          >
            {screenLabels[candidate]}
          </button>
        ))}
      </nav>
    </div>
  );
};
