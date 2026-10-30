# polaris-mobile 固有の手順

`polaris-dev` と `polaris-review` が読む。雛形には無い、このリポジトリだけの決まり。

## 検査

- `bun run check` = lint (Biome) + test + 型検査 + build。クラウドでもブラウザ無しで通る。
- `check:e2e` と `check:vrt` は CI (check.yml の `e2e` `vrt` ジョブ) が回す。手元では回さなくてよい。

## VRT の基準画像 (開発係)

VRT は Storybook の静的ビルドを Linux で撮り、`vrt/__screenshots__/` の基準画像と比べる。
`.tsx` か `.css` か `.stories.tsx` を変えた PR は、見た目が変わる可能性があり、そのままでは `vrt` ジョブが落ちる。

push した後に、そのブランチで基準画像を作り直す workflow を起動する。

```sh
gh api -X POST repos/Hirayama61/polaris-mobile/actions/workflows/vrt-update.yml/dispatches \
  -f ref='claude/issue-N' -f 'inputs[branch]=claude/issue-N'
```

workflow が基準画像を更新すると、bot の commit (`ci: VRT の基準画像を更新する`) がブランチに積まれ、check が起動し直す。
変化が無ければ commit は積まれない。
PR 本文の「## 確かめたこと」に「vrt-update を起動した」と 1 行書く。

## VRT の基準画像 (レビュー係)

差分に `vrt/__screenshots__/*.png` が含まれていたら、見た目が変わった story。
変わった PNG を Read で開いて見る (Read は画像を表示できる)。`git show origin/main:<path>` で変更前を一時ファイルに出して見比べてよい。
Issue が求める変化なら承認してよい。Issue と無関係な story の画像が変わっていたら、範囲外の変更として指摘する (頻度 × 影響は見た目の崩れとして評価する)。

## 守ること (抜粋)

- ランタイムの依存を足さない。開発用の依存 (検査、Storybook、テスト) は可。
- 画面は「今日」「夜」「設定」の 3 つ。増やさない。
