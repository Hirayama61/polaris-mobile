import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ChangelogSheet } from "./ChangelogSheet";
import { formatDateLabel, formatTokyoIso, polarisToday } from "./clock";
import { loadDraft, saveDraft } from "./drafts";
import { FEEDBACK_DRAFT_KEYS, FeedbackSheet } from "./FeedbackSheet";
import type { FeedbackDraft } from "./feedback";
import { hasUnansweredQuestion, type InboxItem } from "./inbox";
import { loadInboxSeenAt, saveInboxSeenAt } from "./inboxSeen";
import { ProjectsSheet } from "./ProjectsSheet";
import { QuestionSheet } from "./QuestionSheet";
import { BlogScreen } from "./screens/Blog";
import { InboxScreen } from "./screens/Inbox";
import { NightScreen } from "./screens/Night";
import { SettingsScreen } from "./screens/Settings";
import { TodayScreen } from "./screens/Today";
import { isConfigured, loadSettings, type Settings, saveSettings } from "./settings";
import { TasksSheet } from "./TasksSheet";
import { type BackTo, GearIcon, InboxIcon, MessageIcon, MoonIcon, PenIcon, SunIcon } from "./ui";
import { useDaily } from "./useDaily";
import { getInboxItems, useInbox } from "./useInbox";
import { useOnline } from "./useOnline";

const screens = ["today", "inbox", "night", "blog", "settings"] as const;

type Screen = (typeof screens)[number];

const screenLabels = {
  today: "今日",
  inbox: "受信箱",
  night: "夜",
  blog: "ブログ",
  settings: "設定",
} satisfies Record<Screen, string>;

/** 受信箱から開いたシートの戻るボタンの文言。押すとシートを閉じて受信箱に戻る。 */
const INBOX_BACK_LABEL = `${screenLabels.inbox}に戻る`;

const screenIcons = {
  today: <SunIcon />,
  inbox: <InboxIcon />,
  night: <MoonIcon />,
  blog: <PenIcon />,
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
 * 画面全体。ルーターは使わず、state で 5 画面を切り替える。
 */
export const App = () => {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>(() => (isConfigured(loadSettings()) ? "today" : "settings"));
  const today = useToday();
  const isOnline = useOnline();
  const daily = useDaily(settings, today);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft>(loadFeedbackDraft);
  const closeFeedback = useCallback(() => setIsFeedbackOpen(false), []);
  const inbox = useInbox(settings);
  const reloadInbox = inbox.reload;
  // 受信箱に入る直前に残っていた時刻。入った時刻で上書きする前に取っておき、「新着」の基準にする。
  const [inboxSeenAt, setInboxSeenAt] = useState<string | undefined>(undefined);
  const [openedItem, setOpenedItem] = useState<InboxItem | undefined>(undefined);
  const closeItem = useCallback(() => {
    setOpenedItem(undefined);
    reloadInbox();
  }, [reloadInbox]);
  const inboxBackTo: BackTo = { label: INBOX_BACK_LABEL, onBack: closeItem };
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const closeProjects = useCallback(() => setIsProjectsOpen(false), []);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const closeChangelog = useCallback(() => setIsChangelogOpen(false), []);
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
    setOpenedItem(undefined);
    setIsProjectsOpen(false);
    setIsChangelogOpen(false);
    setScreen("settings");
  };

  const selectScreen = (next: Screen): void => {
    if (next === "inbox" && screen !== "inbox") {
      setInboxSeenAt(loadInboxSeenAt());
      saveInboxSeenAt(formatTokyoIso(new Date()));
      reloadInbox();
    }
    setScreen(next);
  };

  const inboxItems = getInboxItems(inbox.state);
  const hasInboxAlert = inboxItems !== undefined && hasUnansweredQuestion(inboxItems);

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
        {screen === "inbox" && (
          <InboxScreen
            state={inbox.state}
            seenAt={inboxSeenAt}
            onOpenItem={setOpenedItem}
            onOpenProjects={() => setIsProjectsOpen(true)}
            onRetry={reloadInbox}
            onOpenSettings={openSettings}
          />
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
        {screen === "blog" && (
          <BlogScreen settings={settings} isOnline={isOnline} onOpenSettings={openSettings} />
        )}
        {screen === "settings" && (
          <SettingsScreen
            settings={settings}
            onSave={handleSaveSettings}
            onOpenChangelog={() => setIsChangelogOpen(true)}
          />
        )}
      </main>

      <nav className="tab-bar" aria-label="画面">
        {screens.map((candidate) => {
          const isAlerted = candidate === "inbox" && hasInboxAlert;
          return (
            <button
              key={candidate}
              type="button"
              className={candidate === screen ? "tab tab-active" : "tab"}
              aria-current={candidate === screen ? "page" : undefined}
              aria-label={isAlerted ? `${screenLabels[candidate]}(未回答の質問あり)` : undefined}
              onClick={() => selectScreen(candidate)}
            >
              {screenIcons[candidate]}
              <span>{screenLabels[candidate]}</span>
              {isAlerted && (
                <span className="tab-alert" aria-hidden="true">
                  !
                </span>
              )}
            </button>
          );
        })}
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
      {openedItem?.kind === "question" && (
        <QuestionSheet
          settings={settings}
          isOnline={isOnline}
          initialQuestion={openedItem}
          backTo={inboxBackTo}
          onClose={closeItem}
          onOpenSettings={openSettings}
        />
      )}
      {isProjectsOpen && (
        <ProjectsSheet
          settings={settings}
          inboxItems={inboxItems}
          onClose={closeProjects}
          onOpenSettings={openSettings}
        />
      )}
      {openedItem?.kind === "task" && (
        <TasksSheet
          settings={settings}
          initialTask={openedItem}
          backTo={inboxBackTo}
          onClose={closeItem}
          onOpenSettings={openSettings}
        />
      )}
      {isChangelogOpen && <ChangelogSheet entries={__APP_CHANGELOG__} onClose={closeChangelog} />}
    </div>
  );
};
