# 仕様・検証記録

更新日: 2026-10-02。導入と利用方法は [README](../README.md) を参照してください。

## 統合方針

`sankou_md_to_html` の 0.2.0 を基準に実装・表示・セットアップ・テストを統合しました。参考版は比較用のローカル資料として残し、Git 管理から除外しています。

- Pandoc 標準の Markdown / HTML5、メタデータ、属性、生 HTML、数式を採用します。
- 章番号は既定で有効、目次は H4 までです。旧版の番号なし表示は `--no-number-sections` で利用できます。
- 参考版の図ビューアー、タイトルカード、表・画像・目次の表示改善を採用します。
- 社内 SVN、サーバー固有手順、proxy 対策用の curl ダウンローダーと Mermaid 暫定同梱は採用しません。
- Mermaid はセットアップ時に Node.js の fetch で取得・検証します。生成キャッシュは Git に含めません。
- 本プロジェクトの MIT ライセンス、固定した第三者ライセンスの取得・検証・HTML への埋め込みは保持します。
- 参考版の旧バッチ実装 `archive/` は現行 CLI の構成に含めません。

## 実装構成

| ファイル | 役割 |
| --- | --- |
| `src/cli.js` | 引数解析、診断、変換結果・警告の表示 |
| `src/convert.js` | Pandoc AST 変換、資産埋め込み、一時出力からの置換 |
| `src/environment.js` | インストール位置、最低対応版、Pandoc の版別引数 |
| `src/assets.js` | UTF-8、HTML エスケープ、Mermaid の整合性確認 |
| `src/pandoc.js` | 子プロセス、ローカル Pandoc、固定版コンテナ |
| `src/entry-point.js` | ディレクトリ別名・シンボリックリンク経由の起動判定 |
| `src/open.js` | Windows / Linux の既定ブラウザー起動 |
| `src/path-setup.js` | Windows ユーザー PATH の管理、Linux 実行権限 |
| `setup.js` / `setup.sh` | 依存取得、コマンド登録、Ubuntu のユーザー導入・解除 |
| `assets/` | ページ構成、テーマ、構文強調、目次・コピー・図ビューアー |

Node.js 20.20.0 以降、Pandoc 3.1.3 以降を使用します。将来のメジャー版を一律に拒否しませんが、未検証の版すべてでの動作を保証するものではありません。

## 変換・表示の仕様

```text
Markdown → Pandoc JSON AST → Mermaid ブロック置換
         → Pandoc HTML5 / embed-resources → Mermaid 埋め込み → 完成ファイルへ置換
```

| 項目 | 仕様 |
| --- | --- |
| 入出力 | 1 入力から 1 HTML。UTF-8、BOM、LF / CRLF、日本語・空白を含むパス |
| 章番号・目次 | 既定で章番号付き、H1〜H4 の目次。H5 / H6 は本文のみ |
| タイトル | YAML の title / subtitle / author / date / pagetitle を使用 |
| Markdown | Pandoc の標準 reader。脚注、定義リスト、表、数式、属性を保持 |
| HTML | 生 HTML と YAML includes を保持。サニタイズしない |
| 画像・CSS | Pandoc の embed-resources。相対パスは入力フォルダー基準。URL 資源は変換時に取得 |
| 失敗時 | 入力と同じ実体への上書きを拒否。変換失敗・画像欠落時は既存出力を維持 |
| Mermaid | 12.0.0 の検証済み単一 JS を図のある HTML のみに埋め込む。strict で描画 |
| 図ビューアー | 全体表示、拡大縮小、ホイール、ドラッグ、キーボード、Esc、フォーカス復帰 |
| 表・コード | 表の横スクロール、結合セル、構文強調、コピー失敗時の手動操作案内 |
| JS 無効 | 本文・画像・目次・図ソースを表示 |
| 印刷・狭幅 | レスポンシブな目次・タイトル・画像。印刷前に拡大図を本文へ戻す |
| オフライン | 埋め込んだ資産は file:// で閲覧可能。文書独自の動的通信・外部リンクは対象外 |

従来の CSP や生 HTML・URL 画像・数式の独自制限は廃止しました。信頼できる文書・カスタム資産を使用してください。元文書のスクリプトやイベント属性はブラウザーで実行される場合があります。

## テスト

`node setup.js` の後に `npm ci --ignore-scripts` を実行します。`npm test` は変換・CLI・セットアップを確認します。ブラウザー依存の準備と操作テストは README の開発手順を参照してください。

| テスト | 主な確認内容 |
| --- | --- |
| `converter.test.mjs` | ランチャー、相対パス、番号切替、カスタム資産、異常終了 |
| `core.test.mjs` | Pandoc 標準出力との比較、タイトル・YAML、画像・HTML・数式、入力保護、Mermaid |
| `setup.test.mjs` | 取得失敗・ハッシュ不一致、キャッシュ再利用、別名起動、Windows PATH、Linux 登録 |
| `ubuntu-setup.test.mjs` | 一時 HOME と模擬配布物による導入・解除、既存環境の保護、ARM64 選択 |
| `browser.mjs` | Chromium / Firefox、オフライン資産、図ビューアー、目次、コピー、印刷、狭幅、JS 無効 |

参考版で欠けていた `fixtures/pandoc.md` と `fixtures/formatting.md` を補完しました。Pandoc 3.8 が Markdown 画像にも figure を生成する違いを考慮して、HTML 画像のテスト対象はキャプションで識別します。

CI は Windows / Ubuntu と Node.js 20.20.0 / 24.21.0 を組み合わせ、Windows では Pandoc 3.8、Ubuntu ではディストリビューション版を使用します。

### 統合後の実測結果

- Windows: Node.js 24.21.0 / Pandoc 3.8。変換・セットアップ 37 件成功、10 件スキップ。
- Ubuntu / WSL: Node.js 22.22.0 / Pandoc 3.1.3。変換・セットアップ 42 件成功、5 件スキップ。
- スキップは他 OS 専用の処理と、明示的な有効化が必要なコンテナ試験です。
- Ubuntu / WSL の Chromium 145 / Firefox 146 と Windows の Chromium 145 で、オフライン・図ビューアー・目次・コピー・HTML 表・印刷・狭幅・JS 無効のブラウザー試験に成功しました。
- Windows の Firefox 146 は実行ファイルの「サイド バイ サイド構成」エラーで起動できず（Playwright では `spawn UNKNOWN`）、この環境での表示試験は未完了です。
- キャッシュのない別配置から `node setup.js` を実行し、Mermaid と第三者ライセンスの実ダウンロード、`--doctor`、図入りサンプルの変換に成功しました。

### 検証範囲

Ubuntu のランタイム導入試験は模擬 HTTPS 配布物を使用し、実ユーザーの導入・PATH を変更しません。Windows の PATH 試験は専用の一時レジストリキーを使用します。ARM64 実機、コンテナ実行、既定ブラウザーの前面表示、UNC・ネットワーク共有は今回の実機確認対象外です。

クリップボードの成功・拒否は模擬 API、画面拡大は文字サイズ 200% で確認します。一部のコントラスト・キーボード試験によって WCAG 全体への適合を宣言するものではありません。
