# Polaris Mobile

スマホ用 PWA。polaris-data (private) の daily / journal を GitHub Contents API で読み書きする。
公開先は GitHub Pages。main への push で自動デプロイされる。

## 守ること

- 画面は「今日」「夜」「設定」の 3 つ。増やさない。機能は既存の画面か、要望シートのようなシートに収める。
- daily で書き換えてよいのは「あなたの番」のチェック、「振り返り」、frontmatter の `review_at` だけ。他の行は 1 文字も変えない。`src/daily.ts` のテストがこの契約。
- 通信先は api.github.com だけ。PAT を他に送らない、ログに出さない。
- ライブラリを足さない (UI ライブラリ、ルーター、状態管理、octokit)。手書き CSS。
- `bun run test`、`bunx tsc --noEmit`、`bun run build` が通らない変更は出さない。
- UI/UX はデスクトップ版 Polaris と同じく catnose さんの流儀。余白、落ち着いた配色、タップ対象 44px 以上、開いて 3 秒で今日やることが分かる。
- 日本語の文章は結論から。コードコメントは常体で、コードから読み取れない制約だけを書く。

## 構成

- `src/screens/`: Today, Night, Settings
- `src/daily.ts`: daily の節の抽出と書き換え (純粋関数)
- `src/github.ts`: Contents API と Issues API
- `src/FeedbackSheet.tsx`: 要望シート (Issue を作る)
- `src/drafts.ts`: 下書き (localStorage、日付ごと)

## 開発の流れ

- 思いつきと要望は polaris-data の `inbox/` に入る。クラウドの整理ループが分類し、明確なものだけをこのリポジトリの Issue にして `ready` ラベルを付ける。曖昧なものは Polaris のタスクとして質問が出る。
- クラウドの開発ループは `ready` の Issue だけを扱う。Issue 1 件につきブランチ `claude/issue-<番号>` と PR 1 本。CI (check) が通った PR を人がマージすると Pages に出る。
- ラベル: `ready` は実装してよい。`hold` は人の判断待ち。`needs-info` は質問中 (答えは Polaris のタスクに書く)。`human` は人がやる Issue。`split` は小さな Issue に分割した元。

レビューと修正の基準は AGENTS.md にある。
