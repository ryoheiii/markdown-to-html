# 仕様・検証記録

更新日: 2026-10-02。導入手順は[README](../README.md)を参照。

## 1. 構成

| 項目 | 採用方針 |
|---|---|
| プロジェクト / CLI | `markdown-to-html` / `mdh` |
| 導入 | 浅いclone → setup → PATHの恒久設定。Windowsは `node setup.js --add-path` / `--remove-path` |
| 前提 | Node.js 24.21以上・25未満、Pandoc 3.8以上・4未満 |
| OSS取得 | setupで固定版・ハッシュを確認。取得物はGit管理しない |
| Mermaid | 12.0.0の公式フル単一JS。必要なHTMLへ一度だけ埋め込む |
| 通常利用 | npmインストール・ブラウザー起動・ネットワーク接続は不要 |

## 2. 変換と表示

**変換経路**

```text
Markdown → Pandoc JSON AST → 資産確認 → Pandoc HTML → 完成ファイルへ置換
```

| 項目 | 契約 |
|---|---|
| 入出力 | 1入力→1HTML。UTF-8、BOM、LF/CRLFに対応 |
| 画像 | PNG/JPEG/GIF/WebP/依存のないSVG。相対パスは入力基準 |
| 生HTML / 数式 | 生HTMLは文字表示。数式の解析なし |
| ファイル保護 | 引数配列でPandocを起動。一時出力を使い、失敗時は既存HTMLを維持 |
| 図の描画 | 閲覧時に図ごとに処理。不正図にはエラーとソースを表示 |
| Mermaid設定 | strict / baseの青系テーマ / dagre / classic / OSフォント |
| オフライン | 元資料不在・file://で表示。CSPで表示用の外部通信を抑止 |
| 目次 / コード | Pandocの見出しID・H1〜H3目次・構文ハイライトを利用 |
| コピー | 文字内容のみ。権限拒否時は選択して手動コピーへ誘導 |
| JS無効 | 本文・画像・展開済み目次・図ソースを維持 |
| 狭幅 | 目次を上部へ移動。表・コード・大きい図は内部スクロール |

### 追加しないもの

- 外部画像取得、数式、生HTML実行、SVG依存の収集。
- Mermaidの独自config/CSS・画像・外部アイコン。
- 独自Markdownパーサー、独自バンドラー、通常変換用ブラウザー。
- 常駐サーバー、監視、プラグイン、独自VS Code拡張、PDF出力。
- tgz配布、npm公開、グローバルnpmインストール。

## 3. 検証

### 環境

| 対象 | 使用版 |
|---|---|
| Windows | build 26300 |
| Ubuntu / WSL2 | Ubuntu 24.04.5 |
| Node.js / Pandoc | 24.21.0 / 3.8 |
| テスト用ブラウザー | Chromium 145.0.7632.6 / Firefox 146.0.1 |
| テスト実行 | Playwright 1.58.2、Node標準テスト |

### 確認項目

| 分野 | 確認内容 |
|---|---|
| 導入 | 新規浅いclone、setup、PATH起動、別cwdからの変換 |
| Windows PATH | 一時レジストリキーで追加・削除・重複防止・既存項目と値の型の保持を確認 |
| キャッシュ | 正常キャッシュで通信なし。未setupなら手順を案内 |
| パス | 日本語・空白・&・括弧・#・%、相対出力・相対画像 |
| 入力 | GFM、BOM/CRLF、生HTML文字表示、数式風テキスト |
| 図 | フロー・シーケンス・クラス・状態・ER・Gantt、不正図の分離 |
| 画像 | PNG/JPEG/WebP/GIF/SVG、元資料削除後の実表示 |
| オフライン | 新規offlineコンテキスト、file://。表示用要求・CSP違反0 |
| 操作 | コピー文字列、権限拒否、目次リンク・キーボード開閉、JS無効 |
| 画面 | 1366×768、1920×1080、狭幅、文字200%。横はみ出しなし |
| 色 | 本文・補助・ハイライトのコントラスト4.5:1以上 |
| 異常系 | 依存欠落、権限拒否、Pandoc失敗、入力・既存HTMLの保護 |

2026-10-02のファイル統合後に再検証済みです。CLIはWindowsで17件成功・3件skip、Ubuntuで18件成功・2件skip（OS専用項目）。Chromium・Firefoxの表示試験も両OSで成功しました。

CI: [GitHub Actions](https://github.com/ryoheiii/markdown-to-html/actions)。[clone/setup方式の成功記録](https://github.com/ryoheiii/markdown-to-html/actions/runs/36891303183)。

### 未確認・制限

| 項目 | 状態 |
|---|---|
| VS Code | 実UIからのタスク操作は未確認 |
| ブラウザー拡大 | 文字拡大・reflowは確認。UIのズーム操作は未確認 |
| クリップボード | 成功文字列は模擬。拒否はChromium実権限と両ブラウザーの模擬拒否で確認 |
| `--open` | 失敗時の警告は確認。既定ブラウザーの前面表示は未確認 |
| 同期フォルダー | Dropbox上で一時削除のEBUSYを記録。ブラウザー試験は通常TEMPで成功 |
| 対応保証外 | UNC、共有・特殊パス、全Mermaid図種、任意SVGの完全検証 |

一部のアクセシビリティ試験によってWCAG全体への適合を宣言しません。
