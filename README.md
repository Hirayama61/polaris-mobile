# Polaris Mobile

個人用タスク基盤 Polaris のデータリポジトリ(`Hirayama61/polaris-data`、Markdown + frontmatter)を、スマホから読み書きする PWA。

サーバーを持たない。
ブラウザから GitHub の REST Contents API を直接叩き、変更はそのまま commit になる。

## 画面

| 画面 | できること |
| --- | --- |
| 今日 | `daily/YYYY-MM-DD.md` の「あなたの番」と「今日の時間割」を表示する。チェックを切り替えると即座に commit する |
| 夜 | 振り返りと日記を書く。保存で daily の「振り返り」節と frontmatter の `review_at` を更新し、`journal/YYYY-MM-DD.md` に追記する |
| 設定 | fine-grained PAT・owner/repo・ブランチ・要望の送り先を localStorage に保存する |

ヘッダー右の吹き出しから、どの画面でも要望を送れる。
送ると要望の送り先(既定 `Hirayama61/polaris-mobile`)に Issue ができる。
本文の末尾には送信元の画面名・日付・アプリのバージョンが 1 行入る。
書きかけの要望と夜の入力は localStorage に残るので、シートを閉じたりタブを移ったりしても消えない。

「今日」は Asia/Tokyo の日付。
0:00〜4:00 は前日を「今日」として扱う。

daily のうち、このアプリが書き換えるのは「あなたの番」のチェック状態・「振り返り」の本文・`review_at` だけ。
他の行は変えない(朝ジョブと夜ジョブが書くため)。

オフライン時は最後に読んだ内容を表示する。
書き込みはオンラインになってからやり直す必要がある(キューは持たない)。

## PAT の作り方

GitHub の [Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens/new) で作る。

1. Token name: `polaris-mobile` など。
2. Expiration: 任意。切れたら設定画面で入れ直す。
3. Repository access: **Only select repositories** を選び、`polaris-data` と `polaris-mobile` を選ぶ。
4. Permissions > Repository permissions: **Contents** と **Issues** を **Read and write** にする。他は付けない(Metadata は自動で Read-only が付く)。
   - `polaris-data` には Contents が要る(daily と journal の読み書き)。
   - `polaris-mobile` には Issues が要る(要望の送信)。fine-grained PAT の権限は選んだリポジトリ全部に同じように付くため、`polaris-mobile` にも Contents の書き込み権限が付く(`main` への push は Pages のデプロイにつながる)。
   - 要望の送り先を別のリポジトリに変えたときは、そのリポジトリも Repository access に足す。
5. Generate token を押し、`github_pat_` で始まる文字列をアプリの設定画面に貼る。

トークンはこの端末のブラウザの localStorage にだけ保存される。
端末を失くしたときは GitHub 側でトークンを失効させる。

## GitHub Pages の有効化

`main` への push で `.github/workflows/deploy-pages.yml` が build して Pages へデプロイする。
初回だけ次の設定が要る。

1. リポジトリの Settings > Pages を開く。
2. Build and deployment の Source を **GitHub Actions** にする。
3. `main` に push する(または Actions タブから `Deploy to GitHub Pages` を手動実行する)。
4. `https://hirayama61.github.io/polaris-mobile/` を iPhone の Safari で開き、共有メニューから「ホーム画面に追加」する。

`vite.config.ts` の `base` と manifest の `start_url` は `/polaris-mobile/` に固定している。
リポジトリ名を変えるときは両方を直す。

## 開発

```sh
bun install
bun run dev        # 開発サーバー
bun run test       # vitest
bunx tsc --noEmit  # 型検査
bun run build      # tsc + vite build
```

Markdown の節の抽出・チェックの切り替え・振り返りの差し込み・`review_at` の更新は `src/daily.ts` の純粋関数にまとめ、`src/daily.test.ts` で朝ジョブの出力例を使って確かめている。
