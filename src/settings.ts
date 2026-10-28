/**
 * GitHub 接続設定。localStorage の 1 キーに保存する。
 */
export type Settings = {
  token: string;
  owner: string;
  repo: string;
  branch: string;

  /**
   * 要望を Issue として送るリポジトリ。`owner/repo` の形。
   */
  issueRepo: string;
};

const STORAGE_KEY = "polaris-mobile:settings";

/**
 * 既定値。トークンは空。
 */
export const defaultSettings: Settings = {
  token: "",
  owner: "Hirayama61",
  repo: "polaris-data",
  branch: "main",
  issueRepo: "Hirayama61/polaris-mobile",
};

const readString = (source: Record<string, unknown>, key: keyof Settings): string => {
  const value = source[key];
  return typeof value === "string" ? value : defaultSettings[key];
};

/**
 * 保存済みの設定を読む。
 *
 * @returns 保存が無い、または壊れていれば既定値。
 */
export const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return defaultSettings;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return defaultSettings;
    }
    const source: Record<string, unknown> = { ...parsed };
    return {
      token: readString(source, "token"),
      owner: readString(source, "owner"),
      repo: readString(source, "repo"),
      branch: readString(source, "branch"),
      issueRepo: readString(source, "issueRepo"),
    };
  } catch {
    return defaultSettings;
  }
};

/**
 * 設定を保存する。
 *
 * @param settings - 保存する設定。前後の空白は取り除く。
 * @returns 保存した値。
 */
export const saveSettings = (settings: Settings): Settings => {
  const trimmed: Settings = {
    token: settings.token.trim(),
    owner: settings.owner.trim(),
    repo: settings.repo.trim(),
    branch: settings.branch.trim(),
    issueRepo: settings.issueRepo.trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
};

/**
 * GitHub へアクセスできる設定かどうか。
 *
 * @param settings - 判定する設定。
 * @returns トークン・owner・repo・ブランチがすべて埋まっていれば true。`issueRepo` は見ない。
 */
export const isConfigured = (settings: Settings): boolean =>
  settings.token !== "" &&
  settings.owner !== "" &&
  settings.repo !== "" &&
  settings.branch !== "";
