/** package.json の version。vite.config.ts の define で埋め込む。 */
declare const __APP_VERSION__: string;

/** ビルド時の git log から作った更新履歴 (新しい順)。git が読めなければ空。 */
declare const __APP_CHANGELOG__: import("./changelog").ChangelogEntry[];
