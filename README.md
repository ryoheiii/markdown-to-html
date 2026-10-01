# markdown-to-html

Markdown・ローカル画像・Mermaidを、単独で持ち運べるHTMLへ変換するCLI `mdh` です。変換はPandoc、図はHTMLを開いたブラウザーで描画します。

## 導入

必要なものは **Node.js 24.21以上・25未満** と **Pandoc 3.8以上・4未満** です。[Node.js](https://nodejs.org/en/download)・[Pandoc](https://pandoc.org/installing.html) の公式配布版を導入してください。Ubuntuのapt版は古い場合があります。

```sh
git clone --depth 1 https://github.com/ryoheiii/markdown-to-html.git
cd markdown-to-html
node setup.js
```

setupは固定版Mermaid 12.0.0と必要なライセンスを上流npm配布物のCDNから取得し、SHA-256を検証して `.cache/` に保存します。OSS本体はリポジトリに置きません。正常なキャッシュがあれば再取得しません。通信はsetup時だけです。**通常利用にnpm installは不要**です。

Windows（PowerShell）では、clone先の `bin` をPATHへ追加します。

```powershell
$env:Path = "$PWD\bin;$env:Path"
mdh --doctor
mdh "資料/設計メモ.md"
```

恒久化する場合は、Windowsの「環境変数」でユーザーのPathへclone先の `bin` の絶対パスを追加します。`mdh.cmd` を使うためPowerShellの実行ポリシー変更は不要です。

Ubuntu／WSLでは次を実行し、恒久化する場合は同じ設定を絶対パスで `~/.bashrc` 等へ記載します。

```sh
export PATH="$PWD/bin:$PATH"
mdh --doctor
mdh "資料/設計メモ.md"
```

clone先は実行時にも必要です。移動した場合はPATHも変更してください。更新は `git pull` → `node setup.js`。削除はPATHから設定を外し、clone先を削除します。Node/Pandocの自動導入や更新は行いません。

## 使い方

```sh
mdh document.md
mdh document.md -o "出力/document.html"
mdh document.md --open
mdh --help
```

- 1入力から1HTML。既定は入力と同じ場所の同名 `.html`。`-o`の相対パスは実行時の作業フォルダー基準です。
- 画像の相対パスは入力Markdown基準。PNG/JPEG/WebP/GIFと、外部依存のないSVGを埋め込みます。欠落画像・外部URL画像はエラーです。通常のWebリンクは残ります。
- UTF-8（BOM可）、LF/CRLFに対応。生HTMLは文字として表示し、数式は解析しません。
- HTMLだけを移動して `file://`・オフラインで開けます。Mermaidは必要な文書に一度だけ埋め込みます。
- **CLIの成功はHTML生成の成功**です。図の構文・描画エラーはHTMLの該当箇所へ元ソースとともに表示し、他の機能は継続します。
- Copyが権限等で失敗した場合はコードを選択し、Ctrl+C等の手動操作を案内します。JS無効時は本文・画像・目次・図のソースが残ります。
- 入力の上書きを拒否し、生成失敗時は既存HTMLを残します。`--open` の起動失敗は警告です。

ダークブルーの単一テーマ、H1〜H3の目次開閉、Pandocの構文ハイライトを使用します。表・コード・大きい図は内部で横スクロールします。

外部画像、数式、Mermaidの独自config/CSS・画像・アイコン取り込み、SVG内のスクリプト・外部依存には対応しません。UNC・ネットワーク共有・特殊デバイスパスは正式検証対象外です。WindowsとWSLのパスは自動変換しません。Markdown画像の空白・`#`・`%`は適切にURLエンコードしてください。

VS Codeでも同じCLIを使います。保存したファイルに対し、標準のprocessタスクで `node` と `["clone先/src/cli.js", "${file}"]` を指定できます。独自拡張はありません。

## 開発とライセンス

```sh
node setup.js
npm ci --ignore-scripts
npx playwright install chromium firefox
npm test
npm run test:browser
```

Playwrightはテスト専用です。CIはWindows／Ubuntuでsetup・CLI・オフライン表示を確認します。tgz作成・npm公開・独立インストールの仕組みはありません。

- `bin/`：PATH用の入口
- `src/`：CLIとPandoc処理
- `assets/`：自作テンプレート・CSS・閲覧用JS
- `setup.js` / `dependencies.json`：固定版の取得処理とハッシュ
- `tests/`：CLI・表示の回帰テストと架空fixture
- `docs/`：[仕様](docs/PLAN.md)と[検証記録](docs/VERIFICATION.md)

本体は[MIT](LICENSE)。取得したOSSはそれぞれのライセンスに従います。単一HTMLを維持するため、生成HTMLにはMermaid本体、上流のライセンスコメント、取得したライセンス全文とELKのソース案内を残します。過去のvendor資産はGit履歴に残るため、導入例では `--depth 1` で古い履歴の取得を避けています。
