# markdown-to-html

公開リポジトリ: [ryoheiii/markdown-to-html](https://github.com/ryoheiii/markdown-to-html)。CLI名は `mdh` です。

Markdown・ローカル画像・Mermaidから、持ち運べる単一HTMLを作るCLIです。変換はPandoc、図の描画はHTMLを開いたときの公式Mermaidです。ダークブルーのテーマ、H1〜H3の目次、コードコピーを備えます。

```sh
mdh document.md
mdh "資料/設計メモ.md" -o "出力/設計.html"
mdh document.md --open
mdh --doctor
```

**正常終了はHTML生成の成功です。Mermaidの構文・描画成功を保証しません。** 図のエラーはHTMLの該当箇所へ元ソースとともに表示します。

## 必要なもの

|要素|対応範囲／固定試験版|
|---|---|
|Node.js|24.21.0以上、25未満／24.21.0|
|Pandoc|3.8以上、4未満／最低版3.8|
|Mermaid|12.0.0公式フル単一JSを同梱|
|OS|Windows、Ubuntu。実測状況は [検証記録](docs/VERIFICATION.md)|
|ブラウザー|現行Chromium/Edge/Chrome系・Firefox系。試験版は検証記録に記載|

Node/Pandocは別途導入します。通常の導入・変換にブラウザー、Python、Mermaid CLI、バンドラー、npm registry接続は不要です。OSの日本語フォントを使用します。

## Windowsでの導入

1. [Node.js公式](https://nodejs.org/en/download)の24系と、[Pandoc公式リリース](https://github.com/jgm/pandoc/releases/tag/3.8)のWindows版を導入します。端末を開き直します。
2. 配布アーカイブ `ryoheiii-mdh-0.1.0.tgz` をダウンロードし、PowerShellで実行します（このリポジトリはまだ公開Releaseを作っていません）。

```powershell
node --version
pandoc --version
npm.cmd install -g ./ryoheiii-mdh-0.1.0.tgz
npm.cmd prefix -g
Get-Command mdh* -All
mdh.cmd --doctor
mdh.cmd "資料/設計メモ.md"
```

`npm prefix -g` のディレクトリをユーザーPATHへ追加します。PowerShellの `.ps1` shim制限がある場合は `mdh.cmd` を使ってください。実行ポリシーの緩和は不要です。複数のNode/Pandocがある場合は `Get-Command node,pandoc -All` とdoctorの実行パスを確認します。

Windowsのnpm生成 `.cmd` shimは、導入prefixに `&`・括弧を含めた試験で失敗しました。npm導入先にはそれらを含めないでください（文書・画像・出力のパスは使用できます）。既存の特殊なprefixを使う場合は `node "導入先/node_modules/@ryoheiii/mdh/src/cli.js" document.md` の直接起動を利用できます。独自shimは追加しません。

## Ubuntu / WSLでの導入

Node.js 24系とPandoc 3.8以上の[公式Linux配布物](https://pandoc.org/installing.html)を導入します。Ubuntuの標準apt版Pandocは古いことがあるため、必ず版を確認します。公式tar.gz版なら任意のユーザーディレクトリに展開して、その `bin` をPATHに置けます。

```sh
node --version
pandoc --version
npm install -g --prefix "$HOME/.local" ./ryoheiii-mdh-0.1.0.tgz
export PATH="$HOME/.local/bin:$PATH"
command -v mdh
mdh --doctor
mdh "資料/設計メモ.md"
```

PATH設定は利用中のシェルの起動設定にも記載します。`sudo npm install -g` は不要です。WSLではLinux版Node/Pandocを使います。Windows側へ自動切替しません。

更新は新しいtgzに同じinstallコマンドを実行します。削除はWindowsでは `npm.cmd uninstall -g @ryoheiii/mdh`、上記Ubuntu導入では `npm uninstall -g --prefix "$HOME/.local" @ryoheiii/mdh`。既存HTMLは独立したファイルなので残ります。

## 入力と出力

- 1入力→1HTML。既定は入力と同じフォルダーの同名 `.html`。`-o`は実行時ディレクトリ基準です。出力先フォルダーは作成します。
- 画像の相対パスは入力Markdownのフォルダー基準。PNG/JPEG/GIF/WebP/依存のないSVGを扱います。元画像を再圧縮・変色しません。ネイティブの絶対パスも使えます。画像パスの `#`・`%` は `%23`・`%25`、空白は `%20` またはMarkdownの `<...>` 表記を使ってください。
- HTTP(S)、プロトコル相対、data/file URLを画像入力として取得しません。通常のWebリンクは残します。欠落・非対応画像、既知のSVG外部参照は変換エラーです。
- SVGのスクリプト、外部参照、foreignObject、DOCTYPE、外部フォント等は非対応です。SVG依存の再帰収集・修復・完全な安全化はしません。SVGは `img` として埋め込みます。
- UTF-8（BOM可）、LF/CRLF。文字コード推測はせず、不正UTF-8は失敗します。
- 生HTMLは文字として表示し、実行しません。Markdownの数式拡張は無効です。`$...$` は文字、`math`フェンスは通常コードです。
- 入力と同じファイルやハードリンクへの上書きを拒否します。正常生成した一時ファイルだけを置換し、失敗時は既存HTMLを維持します。
- 日本語・空白・`&`・括弧・`#`・`%`を含むローカルパスを試験しています。UNC、ネットワーク共有、Windows拡張長パス、特殊デバイスパスは正式検証対象外です。OS間のパス表記は自動変換しません。
- `--open` は生成後の補助です。Windowsは既定アプリ、Linuxは `xdg-open` を使います。開けない場合は警告と生成先を表示します。

## HTMLの利用

HTMLだけを別フォルダーへ移し、`file://` で開けます。ネットワーク・元Markdown・元画像は不要です。外部リンクや他文書のリンク先は同梱しません。

Mermaidは `securityLevel: strict`、`theme: base` + 青系変数、`layout: dagre`、`look: classic`、OSフォントで固定します。画像・アイコン取り込みと独自config/CSS指示は非対応で、その図にエラーとソースを残します。これは外部表示資産と独自JS/CSSを初期版へ追加しないための境界です。通常のフロー・シーケンス・クラス・状態・ER・Ganttを試験します。上流全図種の成功保証ではありません。

CopyはClipboard APIを使い、拒否時はコードを選択してCtrl+C等の手動操作を案内します。成功していないときに成功表示しません。コピーはコードの文字内容で、元ファイルとの改行バイト一致は保証しません。

JSを無効にしても本文・画像・展開済み目次・Mermaidソースが残ります。図の描画、Copyボタン、目次開閉はJSが必要です。大きい表・コード・図は内部で横スクロールします。狭幅では目次を上へ移します。印刷は簡易CSSのみで、図の印刷用再描画はありません。

Mermaidなしではライブラリを埋め込みません。ありでは何図でも一度だけ埋め込みます。JS本体は **5,575,485 bytes**。HTMLは画像・ライセンス本文・図のソース分だけ増えます。サンプル実測は検証記録に記載します。

## VS Code

標準の「Tasks: Open User Tasks」に [examples/vscode-tasks.json](examples/vscode-tasks.json) を設定します。フォルダー／ワークスペースを開き、Markdownを保存してタスクを実行してください。

`npm root -g` の出力に `/@ryoheiii/mdh/src/cli.js` を足した絶対パスを入力します。毎回入力したくない場合は、`args` の `${input:mdhCli}` をそのパスに置換します。WindowsではJSONのバックスラッシュを `\\` にするか `/` を使ってください。`type: process` でNodeを直接起動するため `.cmd` のシェル解釈に依存しません。タスクUIからの操作確認状況は検証記録を参照してください。

## 開発・検証・配布

```sh
npm ci --ignore-scripts
npx playwright install chromium firefox
npm run test:risk
npm test
npm run test:browser
npm run test:package
npm pack
```

Ubuntuのブラウザー用OSライブラリが不足する場合は開発環境で `npx playwright install --with-deps chromium firefox` を使います。PlaywrightはdevDependencyで、配布tgzには含めません。npm本体のbin機構で `mdh` を登録します。

パッケージ試験は一時prefixへtgzをオフライン導入し、元の `src/assets/vendor` を一時退避して導入済みCLI・doctor・npm shimを実行、最後に復元します。他の変換と同時実行しないでください。`npm link` は使いません。

[CI](.github/workflows/ci.yml) はWindows/Ubuntuで固定版の試験とtgz作成を行います。ワークフローを置いたこととCI実行済みは区別します。

本体は [MIT](LICENSE)。同梱資産は [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) とvendorの全文を参照してください。生成HTMLにも必要表示を保持します。Pandoc/Nodeはこのアーカイブに再配布しません。
