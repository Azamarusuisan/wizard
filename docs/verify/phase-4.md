# フェーズ4 確認手順

## リード取得

1. `GOOGLE_PLACES_API_KEY` 未設定で `npm run leads:fetch` を実行する。
2. `tmp/leads.json` と `tmp/leads.csv` に10件のfixtureが出ることを確認する。
3. 実キー投入後は同じ `npm run leads:fetch` で Google Places から取得する。

## 人間レビューCSV

1. `npm run leads:export` で `excluded` 列付きCSVを出す。
2. 人間が `excluded` を `true` / `false` に直す。
3. `npm run leads:import -- tmp/leads.csv` で `tmp/leads.json` に反映する。

## 勝手にプレビュー

公開情報だけを使い、写真は `/stock/painting-placeholder.svg` のみを使う。口コミは原文転載せず、短い要約だけを `reviewSummary` に入れる。

## 計測

QR表示、電話タップ、LINEタップは `/api/events?leadId=...&name=qr_view|phone_tap|line_tap` に記録する。

## 量産停止条件

30件生成と270件量産は、デザイン差し替え後に人間が明示するまで実行しない。
