# Phase 3 ダミー通し試験メモ

`未記入` を実際のメモ、または `問題なし` に置き換える。

## photos-rich

- 結果: `npm run phase3:dummy` 成功。`caseFirst`、施工事例6件。
- 気になった点:
  - ローカル確認を `file://` で開くとCSSと画像が読めず、素のHTML表示になる。事例主役型の判断がこの状態ではできない。

## photos-three

- 結果: `npm run phase3:dummy` 成功。`classic`、施工事例3件。
- 気になった点:
  - `photos-rich` と同じくCSSと画像が読めない。電話導線もボタンではなく通常リンク表示になる。

## photos-zero

- 結果: `npm run phase3:dummy` 成功。`singlePage`、施工事例0件。
- 気になった点:
  - `photos-zero` もCSSが効かないため、写真ゼロ版が貧相・失礼に見えないかを正しく判断できない。

## Codex修正対象

- [ ] `tmp/phase-3-dummy/review.html` のローカル確認を `file://` ではなく静的サーバ経由で開けるようにする。CSS・画像が効いた状態で3パターンを再確認する。
