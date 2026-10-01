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

以下は検証に使用した **Node.js 24.21.0 / Pandoc 3.8** を入れる手順です。すでに対応版がある場合は「バージョン確認」へ進んでください。

#### Windows（x64）

1. [Node.js 24.21.0の公式MSI](https://nodejs.org/dist/v24.21.0/node-v24.21.0-x64.msi)をダウンロードして実行します。
   - ライセンスを確認し、標準のインストール先・`Add to PATH` を維持してインストールします。
   - ネイティブモジュール用の追加ツールは不要です。
2. [Pandoc 3.8の公式MSI](https://github.com/jgm/pandoc/releases/download/3.8/pandoc-3.8-windows-x86_64.msi)をダウンロードして実行し、画面に従ってインストールします。PATHも設定されます。
3. PowerShellを開き直します。VS Codeを使っている場合はVS Codeも再起動します。

配布元: [Node.js](https://nodejs.org/en/download/archive/v24.21.0) / [Pandocの導入案内](https://pandoc.org/installing.html)。

#### Ubuntu / WSL（x86_64・Bash）

WSLでは、以下を**Ubuntuの端末内**で実行します。Windows側とは別に導入してください。

**① 取得用ツールを準備**

```sh
sudo apt update
sudo apt install -y git curl ca-certificates xz-utils
```

**② Node.jsをユーザーフォルダーに展開**

```sh
mkdir -p "$HOME/.local"
curl -fL https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz -o /tmp/node-v24.21.0-linux-x64.tar.xz
tar -xJf /tmp/node-v24.21.0-linux-x64.tar.xz -C "$HOME/.local"
```

`~/.bashrc` をエディターで開き、末尾に次の行を追加して保存します（恒久設定）。

```sh
export PATH="$HOME/.local/node-v24.21.0-linux-x64/bin:$PATH"
```

**③ Pandocの公式debをインストール**

```sh
curl -fL https://github.com/jgm/pandoc/releases/download/3.8/pandoc-3.8-1-amd64.deb -o /tmp/pandoc-3.8-1-amd64.deb
sudo dpkg -i /tmp/pandoc-3.8-1-amd64.deb
```

Ubuntu標準リポジトリのPandocは対応版より古い場合があるため、ここでは[公式debの導入手順](https://pandoc.org/installing.html#linux)を使います。完了後、端末を開き直してください。

上記はx64向けの手順です。ARM64では[Node.jsの配布一覧](https://nodejs.org/en/download/archive/v24.21.0)・[Pandocの配布一覧](https://github.com/jgm/pandoc/releases/tag/3.8)から対応する資産を選んでください。ARM64環境での動作は未検証です。

#### バージョン確認

新しい端末で実行します。

```sh
node --version
pandoc --version
```

この手順では `v24.21.0` と `pandoc 3.8` が表示されれば導入完了です。古い版が表示される場合は、Windowsでは `where.exe node` / `where.exe pandoc`、Ubuntuでは `command -v node` / `command -v pandoc` で参照先を確認し、PATH内の古い設定を修正してください。

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

clone先で次を実行するだけで、ユーザーPATHへ恒久登録できます。

```powershell
node setup.js --add-path
```

解除する場合も、clone先で実行します。

```powershell
node setup.js --remove-path
```

- 管理者権限・PowerShellの実行ポリシー変更は不要です。
- 対象はこのcloneの `bin` だけです。ほかのPATH項目は保持します。
- 追加の再実行で重複せず、削除済みでも再実行できます。通信は行いません。
- 実行後は端末・Windows Terminal・VS Codeを終了して開き直してください。反映されない場合はWindowsからサインアウトして再ログインします。
- clone先を移動する場合は、移動前に削除、移動後に追加してください。セミコロン `;` を含む場所は登録できません。

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
| 削除（Windows） | clone先で `node setup.js --remove-path` → clone先を削除 |
| 削除（Ubuntu / WSL） | `~/.bashrc` のmdh用PATH行を削除 → clone先を削除 |

### VS Code（Windowsから実行）

Windows版VS Codeの標準タスクに登録すると、編集中のMarkdownを選んで変換できます。追加の拡張機能は不要です。以下は通常のWindowsウィンドウ向けです（Remote WSL・SSH・コンテナー接続は対象外）。

#### 1. VS Code内で導入状態を確認する

1. 上の手順でWindowsにNode.js・Pandocを導入し、clone先で `node setup.js` と `node setup.js --add-path` を実行します。
2. **VS Codeの全ウィンドウを終了してから起動し直します。** PATH変更前から開いているWindows Terminalも終了してください。
3. 「ファイル」→「フォルダーを開く」で、変換したいMarkdownがあるフォルダーを開きます。
4. 「ターミナル」→「新しいターミナル」で **PowerShell** を選び、次を実行します。

```powershell
node --version
pandoc --version
mdh --doctor
```

`mdh --doctor` のNode・Pandoc・Assetsがすべて `OK` なら準備完了です。表示される `Install:` がmdhのclone先です。

#### 2. ユーザータスクを登録する（初回のみ）

1. `Ctrl+Shift+P` でコマンドパレットを開きます。
2. `Tasks: Open User Tasks`（タスク: ユーザータスクを開く）を検索して実行します。テンプレートを聞かれたら `Others` を選びます。
3. 開いた `tasks.json` に以下を設定して保存します。既存のタスクがある場合は、`tasks` 配列へ今回のタスクを追加してください。
4. **`C:/tools/markdown-to-html/src/cli.js` は実際のclone先に置き換えます。** Windowsでも `/` 区切りで書けます。空白を含むパスにも追加の引用符は不要です。

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "mdh: 開いているMarkdownをHTMLに変換",
      "type": "process",
      "command": "node",
      "args": [
        "C:/tools/markdown-to-html/src/cli.js",
        "${file}"
      ],
      "options": {
        "cwd": "${fileDirname}"
      },
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "shared"
      }
    }
  ]
}
```

ユーザータスクなので、ほかのフォルダーでも同じ設定を使えます。タスクでは `node` からCLIを直接起動し、Windowsのバッチファイルの引用処理を避けています。設定は[VS Code公式のTasks仕様](https://code.visualstudio.com/docs/debugtest/tasks)に基づきます。

#### 3. Markdownを変換する

1. 変換したい `.md` をエディターで開き、`Ctrl+S` で保存します。
2. **そのMarkdownのタブを選んだ状態で** `Ctrl+Shift+P` → `Tasks: Run Task`（タスクの実行）→ `mdh: 開いているMarkdownをHTMLに変換` を選びます。
3. ターミナルに出力先が表示され、Markdownと同じフォルダーに同名の `.html` が生成されます。既存の同名HTMLは、変換成功時に更新されます。
4. HTMLをエクスプローラーからブラウザーで開きます。

生成直後にブラウザーで開きたい場合は、タスクの `args` を次の形にします。

```json
"args": ["C:/tools/markdown-to-html/src/cli.js", "${file}", "--open"]
```

変換対象はディスク上の保存済み内容です。新規の未保存タブや、`tasks.json` を選んだままで実行しないでください。`${file}` は現在開いているファイル、`${fileDirname}` はそのフォルダーを指します（[公式の変数一覧](https://code.visualstudio.com/docs/reference/variables-reference)）。

#### うまく動かない場合

| 症状 | 確認すること |
|---|---|
| `node` / `pandoc` / `mdh` が見つからない | VS Codeを全終了して再起動。PowerShellで `where.exe node` / `where.exe pandoc` / `where.exe mdh` を確認 |
| `Cannot find module ...cli.js` | `args` のclone先を修正。`src/cli.js` まで指定しているか確認 |
| Mermaidのsetupが必要と表示される | mdhのclone先で `node setup.js` を実行 |
| 編集内容が反映されない | 対象Markdownを保存し、そのタブを選んで再実行 |
| タスクが見つからない | ユーザーの `tasks.json` を保存し、JSONのエラーがないか確認 |

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
