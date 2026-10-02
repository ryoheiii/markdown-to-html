---
title: Markdown → 単一 HTML 変換（mdh）
---

Markdown を、画像・Mermaid の図・目次を含む **1 つの HTML ファイル**に変換するコマンドです。
画像や CSS・JavaScript を HTML に埋め込み、元の Markdown や画像を一緒に配布せずに閲覧できます。スクリプトが動的に取得する外部データなどは、オフラインでは利用できません。

# 動作環境

| 項目 | 要件 |
| --- | --- |
| OS | Windows（x64）、Ubuntu / WSL（x86_64 / ARM64） |
| Node.js | 20.20.0 以降 |
| Pandoc | 3.1.3 以降 |
| 閲覧 | Edge / Chrome / Firefox などの現行ブラウザー |

Node.js と Pandoc は、次のセットアップ手順で導入します。対応版がインストール済みであれば、そのまま使用できます。

# セットアップ

## プロジェクトを取得する

Git で取得し、プロジェクトのフォルダーに移動します。**以降のセットアップコマンドは、このフォルダーで実行します。**

```sh
git clone --depth 1 https://github.com/ryoheiii/markdown-to-html.git
cd markdown-to-html
```

## Windows

1. Node.js と Pandoc をインストールします（対応版がインストール済みなら不要）。
   公式インストーラーを、既定の設定のまま実行してください。

   - [Node.js 24.21.0](https://nodejs.org/dist/v24.21.0/node-v24.21.0-x64.msi)
   - [Pandoc 3.8.1](https://github.com/jgm/pandoc/releases/download/3.8.1/pandoc-3.8.1-windows-x86_64.msi)

2. PowerShell を開き直し、セットアップと mdh の登録を行います。

   ```sh
   node setup.js
   node setup.js --add-path
   ```

3. PowerShell と VS Code の**ウィンドウをすべて閉じてから開き直し**、動作を確認します。

   ```sh
   mdh --doctor
   ```

   Node / Pandoc / Assets がすべて `OK` なら完了です。

## Ubuntu / WSL

WSL の場合は、Ubuntu の端末で実行します。オプションは Windows の `node setup.js` と共通です。

1. `~/.local/bin` を PATH に追加します（追加済みなら不要）。
   `~/.bashrc` の末尾に次の行を追加し、端末を開き直してください。

   ```sh
   export PATH="$HOME/.local/bin:$PATH"
   ```

2. ダウンロード用のツールをインストールします（インストール済みなら不要）。

   ```sh
   sudo apt update
   sudo apt install -y curl ca-certificates xz-utils
   ```

3. Node.js と Pandoc を導入します。対応版がすでに使える場合は、何も変更しません。

   ```sh
   bash setup.sh --install-node
   bash setup.sh --install-pandoc
   ```

4. セットアップと mdh の登録を行います。

   ```sh
   bash setup.sh
   bash setup.sh --add-path
   ```

   - `bash setup.sh`: Mermaid の検証・必要時の取得と実行ファイルの準備だけを行います。mdh の登録やシェルの PATH 設定は行いません。
   - `bash setup.sh --add-path`: `~/.local/bin/mdh` のリンクを作成します。Mermaid の取得は行いません。
   - 初回は両方を実行してください。すでに正しいリンクがある場合は `--add-path` の再実行は不要です。

5. 動作を確認します。

   ```sh
   mdh --doctor
   ```

   Node / Pandoc / Assets がすべて `OK` なら完了です。

# 使い方

```sh
mdh document.md
```

Markdown と同じフォルダーに `document.html` を作成し、出力先を表示します。見出しと目次には、既定で章番号が付きます。入力した Markdown は変更しません。

| 目的 | コマンド |
| --- | --- |
| 章番号付きの HTML を作成する（既定） | `mdh document.md` |
| 章番号なしの HTML を作成する | `mdh document.md --no-number-sections` |
| 出力先を指定する | `mdh document.md -o "出力/document.html"` |
| 作成後にブラウザーで開く | `mdh document.md --open` |
| 環境を診断する | `mdh --doctor` |
| ヘルプ・バージョンを表示する | `mdh --help` / `mdh --version` |

- 章番号は既定で有効なため、`--number-sections` の指定は不要です。指定しても結果は同じです。`--no-number-sections` と両方を指定した場合は、後の指定を優先します。
- 空白や日本語を含むパスは、引用符で囲んでください。
- コマンド引数の相対パスは、実行したフォルダーが基準です。文書内の画像や CSS などのリソースは、Markdown のフォルダーが基準です。
- デザインを変更する場合は、`--css`（CSS ファイル）や `--after-body`（本文末尾に追加する HTML）を指定します。

## Markdown の書き方

### 文書タイトル

Markdown の先頭に次の YAML を書くと、本文の上にタイトルを表示します。

```yaml
---
title: ビルドおよび更新手順書
---
```

- タイトルは省略できます。省略・空欄の場合はカードを表示せず、タブ名にはファイル名を使用します。
- `:` を含む場合などは、`title: "資料名: 詳細"` のように引用符で囲んでください。
- `title` の強調などは Pandoc が解釈します。`subtitle`・`author`・`date` もタイトル欄に表示でき、タブ名は `pagetitle` で指定できます。

### 本文の書式

- 見出しは `#` → `##` → `###` → `####` の順に使います。目次には `####`（H4）までの4階層が表示されます。
- 章番号は既定で自動的に付きます。見出しに手書きの番号を付けると二重になるため、手書きの番号を使う場合は `--no-number-sections` を指定してください。
- 書式は Pandoc の `markdown` の標準仕様です。脚注・定義リスト・各種テーブル・数式・見出しやリンクの属性も Pandoc に従います。数式の表示は標準の HTML5 出力を使用します。
- ローカル画像・URL 画像・data URI は、Pandoc の `--embed-resources` で埋め込みます。URL 画像などの取得には、変換時に通信が必要です。必要なリソースを取得できない場合は変換を中止します。
- 画像のファイル名に空白・`#`・`%` を含む場合は、URL エンコードしてください（例: 空白は `%20`）。
- HTML のタグ・属性・CSS は Pandoc の解釈どおりに出力します。`<figure>` / `<img>` / `<figcaption>`、`rowspan` / `colspan` を使う表、`<details>` / `<summary>` も使用できます。標準デザインでは画像の縦横比を保ち、表の見出しセルは青背景・濃紺の太字で表示します。
- 図は、言語に `mermaid` を指定したコードブロックで記述します。構文・設定の対応範囲は HTML に埋め込む Mermaid に従い、描画時は `securityLevel: 'strict'` を使用します。外部画像などを描画時に取得する図は、オフライン表示を保証しません。
- 図の「拡大表示」で画面全体を使って確認できます。全体表示・拡大縮小・ドラッグ移動が可能で、`Esc` で閉じます。
- 太字は `**強調したい文字**` と書きます。`**【必須】**文字コード` のように日本語が隣接していても使用できます。`**` のすぐ内側には空白を入れないでください。
- 赤字は `<span style="color:red;">文字</span>`、赤い太字は `<span style="color:red;">**文字**</span>`、下線は `<u>文字</u>` または `[文字]{.underline}` と書けます。通常のコードブロック内の HTML は実行せず、そのまま表示します。

# 全体設計

- **変換の基本**: Pandoc の `-f markdown -t html5` です。Markdown の解析と HTML 生成は Pandoc に任せ、標準の拡張・HTML・属性・メタデータを使用します。
- **処理の流れ**: `mdh` → Node.js → Pandoc で Markdown を JSON AST に解析 → Mermaid のコードブロックを表示用要素に置換 → Pandoc で単一 HTML を生成します。`--standalone`・`--embed-resources`・H4 までの目次・構文強調を使用し、章番号は既定で有効です（`--no-number-sections` で無効化できます）。
- **表示**: [assets/template.html](assets/template.html) がページ構成、[assets/theme.css](assets/theme.css) がデザイン、[assets/app.js](assets/app.js) が目次の開閉・現在位置・表の横スクロール・コードのコピー・Mermaid の描画と拡大表示を担当します。JavaScript が無効でも本文と目次は読め、Mermaid はソースを表示します。
- **依存と出力**: Node.js と Pandoc はローカル環境で実行します。Mermaid はセットアップ時に SHA-256 を検証し、図がある文書だけに埋め込みます。入力は変更せず、一時ファイルで変換が成功してから出力先を置き換えます。

**信頼できる Markdown・画像・カスタム CSS / HTML を使用してください。** HTML や YAML の `header-includes` などをサニタイズするツールではありません。文書内のスクリプトやイベント属性は、生成した HTML を開くと実行される場合があります。

# 登録解除・アンインストール

プロジェクトのフォルダーで、不要になったものだけを実行します。

| 対象 | Windows | Ubuntu / WSL |
| --- | --- | --- |
| mdh の登録 | `node setup.js --remove-path` | `bash setup.sh --remove-path` |
| Pandoc | 「設定」→「アプリ」からアンインストール | `bash setup.sh --remove-pandoc` |
| Node.js | 「設定」→「アプリ」からアンインストール | `bash setup.sh --remove-node` |

- Ubuntu のコマンドは、`setup.sh` で導入したものだけを削除します。元から入っていた Node.js / Pandoc や、`~/.bashrc` の設定は変更しません。
- Node.js / Pandoc は、他のツールで使われている場合があります。削除する前に確認してください。
- プロジェクトのフォルダーを削除する場合は、先に mdh の登録を解除してください。

# Mermaid とライセンス

Mermaid のバンドルやライセンスの取得物は Git に同梱しません。
`node setup.js` が `dependencies.json` に固定した Mermaid 12.0.0 と第三者ライセンスを取得し、SHA-256 を検証して `.cache/mermaid-12.0.0/` に保存します。検証済みのファイルは再利用するため、毎回の取得は不要です。初回セットアップにはインターネット接続が必要です。

図を含む HTML には Mermaid 本体と第三者ライセンスを埋め込みます。mdh の MIT ライセンスも HTML に含めます。配布時にはこれらの表記を保持してください。図がない文書の変換に Mermaid は不要です。

# 開発・検証

通常の変換では npm install は不要です。開発用の依存とブラウザーを準備し、次のテストを実行できます。

```sh
node setup.js
npm ci --ignore-scripts
npx playwright install --with-deps chromium firefox
npm test
npm run test:browser
```

テストは Pandoc 標準出力との比較、入出力の保護、セットアップ、オフライン表示、目次・コピー・図の拡大操作を確認します。詳細は [仕様・検証記録](docs/PLAN.md) を参照してください。

Ubuntu / WSL では `--container` を指定して、固定した Pandoc コンテナで変換することもできます。Docker または Podman が必要です（初回はイメージの取得も必要）。`CONTAINER_RUNTIME=docker` または `podman` で選択できます。文書内のローカルリソースは入力フォルダー内に置いてください。`TEST_CONTAINER_RUNTIME=docker npm test` でコンテナ専用テストを有効にできます。
