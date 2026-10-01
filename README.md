# markdown-to-html

Markdown・ローカル画像・Mermaidから、持ち運べる単一HTMLを作るCLI **`mdh`** です。

[導入](#導入) · [使い方](#使い方) · [対応範囲](#対応範囲) · [開発](#開発) · [仕様・検証記録](docs/PLAN.md)

## 導入

### 1. 必要なソフトを入れる

| ソフト | 対応版 | 入手先 |
|---|---|---|
| Git | cloneに使用 | [公式サイト](https://git-scm.com/downloads) |
| Node.js | 24.21以上・25未満 | [公式サイト](https://nodejs.org/en/download) |
| Pandoc | 3.8以上・4未満 | [公式サイト](https://pandoc.org/installing.html) |

Ubuntuのapt版Pandocは古い場合があります。導入後に確認してください。

```sh
node --version
pandoc --version
```

### 2. cloneしてsetupする

```sh
git clone --depth 1 https://github.com/ryoheiii/markdown-to-html.git
cd markdown-to-html
node setup.js
```

- 通常利用に `npm install` は不要です。
- setupは固定版Mermaidとライセンスを取得し、SHA-256を確認して `.cache/` に保存します。
- 通信は初回setupなど、取得が必要なときだけです。変換・HTML閲覧はオフラインで使えます。

### 3. PATHを恒久設定する

**Windows**

1. スタートで「環境変数」を検索し、「環境変数を編集」を開きます。
2. 「環境変数」→ **ユーザー環境変数**の `Path` →「編集」→「新規」を選びます。
3. setupが表示した `bin` の絶対パスを追加し、各画面を「OK」で閉じます。
4. 端末を開き直します。VS Code内の端末を使う場合はVS Codeを再起動します。

`mdh.cmd` を使用するため、PowerShellの実行ポリシー変更は不要です。

**Ubuntu / WSL（Bash）**

1. `~/.bashrc` をエディターで開きます。
2. setupが表示した `export PATH=...` の行を末尾に追加して保存します。
3. 端末を開き直します。

記載例（パスは実際のclone先に置き換えてください）:

```sh
# ~/.bashrc に記載する行
export PATH='/home/yourname/markdown-to-html/bin':"$PATH"
```

Bash以外では、利用しているシェルの起動設定ファイルへ設定してください。

### 4. 動作を確認する

新しい端末で実行します。

```sh
mdh --doctor
mdh "資料/設計メモ.md"
```

> clone先は実行時にも必要です。移動した場合はPATHを更新してください。

## 使い方

| 操作 | コマンド |
|---|---|
| HTMLを作る | `mdh document.md` |
| 出力先を指定する | `mdh document.md -o "出力/document.html"` |
| 生成後に開く | `mdh document.md --open` |
| 導入状態を確認する | `mdh --doctor` |
| ヘルプを見る | `mdh --help` |

| パス | 基準 |
|---|---|
| 既定の出力 | 入力と同じフォルダーの同名 `.html` |
| 相対 `-o` | コマンドを実行したフォルダー |
| 相対画像パス | 入力Markdownのフォルダー |

**CLIの成功はHTML生成の成功です。** Mermaidは閲覧時に描画し、不正な図にはエラーと元ソースを表示します。他の図や本文は引き続き利用できます。

### 更新・削除

| 操作 | 手順 |
|---|---|
| 更新 | clone先で `git pull` → `node setup.js` |
| 削除 | PATHの設定を削除 → clone先を削除 |

### VS Code

保存済みファイルを標準のprocessタスクから実行できます。

| 設定 | 値 |
|---|---|
| `type` | `process` |
| `command` | `node` |
| `args` | `["clone先/src/cli.js", "${file}"]` |

## 対応範囲

| 項目 | 動作 |
|---|---|
| Markdown | 一般的なGFM構文、UTF-8（BOM可）、LF/CRLF |
| ローカル画像 | PNG / JPEG / WebP / GIF / 外部依存のないSVG |
| HTML | 単一ファイル。`file://`・オフライン・元資料不在で表示 |
| 見た目 | ダークブルー、H1〜H3の目次、コードハイライト |
| 大きい表・コード・図 | 内部で横スクロール |
| コピー拒否 | コードを選択し、Ctrl+C等の手動操作を案内 |
| JavaScript無効 | 本文・画像・目次・Mermaidソースを表示 |
| 変換失敗 | 既存HTMLを維持。入力の上書きを拒否 |
| `--open`失敗 | 生成済みHTMLを残し、警告を表示 |

### 非対応・制限

- 数式、生HTMLの実行、外部URL画像の取得。
- Mermaidの独自config/CSS・画像・外部アイコン、SVG内のスクリプト・外部依存。
- UNC・ネットワーク共有・特殊デバイスパスは正式検証対象外。
- WindowsとWSLのパスは自動変換しません。
- Markdown画像パスの空白・`#`・`%`は適切にURLエンコードしてください。

## 開発

```sh
npm ci --ignore-scripts
npx playwright install chromium firefox
npm test
npm run test:browser
```

setup済みのclone先で実行します。Playwrightはテスト専用です。

| 場所 | 役割 |
|---|---|
| `bin/` | OS別のPATH用入口 |
| `src/cli.js` | 引数・診断・ブラウザー起動 |
| `src/convert.js` | Pandoc呼び出し・資産確認・HTML生成 |
| `assets/` | 自作テンプレート・CSS・閲覧用JS |
| `setup.js` / `dependencies.json` | 固定版の取得・ハッシュ |
| `tests/convert.test.js` / `tests/browser.js` | 変換と表示のテスト |
| [docs/PLAN.md](docs/PLAN.md) | 仕様・検証記録 |

## ライセンス

- 本体: [MIT](LICENSE)。
- 取得したOSS: 各上流ライセンスに従います。
- 生成HTML: Mermaid・必要なライセンス表示・ELKのソース案内を保持します。
- 過去のvendor資産: Git履歴に残ります。導入例の `--depth 1` では取得しません。
