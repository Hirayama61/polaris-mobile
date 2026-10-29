import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatDateLabel, polarisToday } from "./clock";
import { loadDraft, saveDraft } from "./drafts";
import type { FeedbackDraft } from "./feedback";
import { FEEDBACK_DRAFT_KEYS, FeedbackSheet } from "./FeedbackSheet";
import { QuestionSheet } from "./QuestionSheet";
import { NightScreen } from "./screens/Night";
import { SettingsScreen } from "./screens/Settings";
import { TodayScreen } from "./screens/Today";
import { isConfigured, loadSettings, saveSettings, type Settings } from "./settings";
import { GearIcon, MessageIcon, MoonIcon, SunIcon } from "./ui";
import { useDaily } from "./useDaily";
import { useOnline } from "./useOnline";

const screens = ["today", "night", "settings"] as const;

type Screen = (typeof screens)[number];

const screenLabels = {
  today: "今日",
  night: "夜",
  settings: "設定",
} satisfies Record<Screen, string>;

const screenIcons = {
  today: <SunIcon />,
  night: <MoonIcon />,
  settings: <GearIcon />,
} satisfies Record<Screen, ReactNode>;

const loadFeedbackDraft = (): FeedbackDraft => ({
  title: loadDraft(FEEDBACK_DRAFT_KEYS.title) ?? "",
  body: loadDraft(FEEDBACK_DRAFT_KEYS.body) ?? "",
});

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
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft>(loadFeedbackDraft);
  const closeFeedback = useCallback(() => setIsFeedbackOpen(false), []);
  const [isQuestionOpen, setIsQuestionOpen] = useState(false);
  const closeQuestion = useCallback(() => setIsQuestionOpen(false), []);
  useEffect(() => {
    saveDraft(FEEDBACK_DRAFT_KEYS.title, feedbackDraft.title);
    saveDraft(FEEDBACK_DRAFT_KEYS.body, feedbackDraft.body);
  }, [feedbackDraft]);
  const hasFeedbackDraft = feedbackDraft.title.trim() !== "" || feedbackDraft.body.trim() !== "";

  const handleSaveSettings = (next: Settings): void => {
    setSettings(saveSettings(next));
    setScreen("today");
  };

  const openSettings = (): void => {
    setIsFeedbackOpen(false);
    setIsQuestionOpen(false);
    setScreen("settings");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">{formatDateLabel(today)}</h1>
        {!isOnline && <span className="badge badge-offline">オフライン</span>}
        <button
          type="button"
          className={hasFeedbackDraft ? "icon-button icon-button-dot" : "icon-button"}
          aria-label={hasFeedbackDraft ? "思いつきを送る(書きかけあり)" : "思いつきを送る"}
          onClick={() => setIsFeedbackOpen(true)}
        >
          <MessageIcon />
        </button>
      </header>

      <main className="app-main">
        {screen === "today" && (
          <TodayScreen
            settings={settings}
            date={today}
            daily={daily}
            isOnline={isOnline}
            onOpenSettings={openSettings}
          />
        )}
        {screen === "today" && isConfigured(settings) && (
          <section className="section">
            <button type="button" className="button button-block" onClick={() => setIsQuestionOpen(true)}>
              質問に答える
            </button>
          </section>
        )}
        {screen === "night" && (
          <NightScreen
            key={today}
            settings={settings}
            date={today}
            daily={daily}
            isOnline={isOnline}
            onOpenSettings={openSettings}
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
            {screenIcons[candidate]}
            <span>{screenLabels[candidate]}</span>
          </button>
        ))}
      </nav>

      {isFeedbackOpen && (
        <FeedbackSheet
          settings={settings}
          screenLabel={screenLabels[screen]}
          date={today}
          isOnline={isOnline}
          draft={feedbackDraft}
          onDraftChange={setFeedbackDraft}
          onClose={closeFeedback}
          onOpenSettings={openSettings}
        />
      )}
      {isQuestionOpen && (
        <QuestionSheet
          settings={settings}
          isOnline={isOnline}
          onClose={closeQuestion}
          onOpenSettings={openSettings}
        />
      )}
    </div>
  );
};
