# 初期版の検証記録

実施日: 2026-10-02（Asia/Tokyo）。仕様は `docs/PLAN.md`。実装・ローカル検証は完了していますが、GitHub上のCI実行とVS CodeのタスクUI実機確認は未実施です。全完成条件の認定済みとは扱いません。

## 環境

|要素|実測|
|---|---|
|Windows|x64、OS build 26300、PowerShell|
|Ubuntu|24.04.5 LTS、WSL2、Linux 6.18.40.1-microsoft-standard-WSL2|
|Node.js|両OSとも公式24.21.0|
|Pandoc|両OSとも公式3.8（最低対応版）|
|テスト用Playwright|1.58.2、devDependencyのみ|
|Chromium|145.0.7632.6、両OSで確認|
|Firefox|146.0.1、両OSで確認|
|Mermaid|12.0.0公式フルIIFE、5,575,485 bytes|

Node公式配布物のSHA-256を公式SHASUMSと照合。Mermaid npmアーカイブのSHA-512をregistry integrityと照合。同梱JSのSHA-256は `28fca7ae6ebc7ed7bb63bde63136a74bfef14f296a57e403657eeb8b32836073`。vendorのmanifestをdoctor・変換・テストで確認します。

## 結果

|項目|結果・方法|
|---|---|
|実装前の成立性検証|公式単一JS、日本語図、複数図、不正図、埋め込みSVG。元画像ディレクトリを削除、新規コンテキストをofflineにしてfile://で表示。Windows/WSLのChromium・Firefoxで成功|
|CLI・資産・ライセンス試験|17件。Windows: 14成功、Unix専用3件skip。Ubuntu/WSL: 16成功、Windows専用1件skip。失敗0|
|Markdown|GFM、入れ子、引用内図、表、チェックリスト、日本語、BOM/CRLF、コード内の説明用Mermaid、未知言語、数式風テキスト、生HTMLの文字表示|
|パス|日本語・空白・&・括弧・#・%、入力と異なるcwd、相対出力、新規出力ディレクトリ。画像は入力基準|
|画像|PNG/JPEG/WebP/GIF/SVGを元資料削除後に実表示。6画像すべてnaturalWidth>0。SVGの直接DOM挿入なし|
|Mermaid|フロー、シーケンス、クラス、状態、ER、Gantt。長い図を含む8成功、意図した不正図1エラー。後続の図も成功|
|外部資産|対応fixtureで表示用ネットワーク要求0、CSP違反0。外部画像・欠落画像・非対応形式・既知のSVG依存は変換失敗|
|コピー|余白・空行・HTML例を含む文字列をClipboard APIへそのまま渡す。両ブラウザーで拒否を模擬。Chromiumでは実際のclipboard-write権限をdeniedにして手動案内を確認。OSクリップボードへの成功書き込み自体は模擬|
|目次|Pandocの全リンク先が実在。同名日本語、H2開始、階層飛び、Enter/Spaceによる開閉、aria-expanded|
|画面|1366×768、1920×1080、683×384、375×812でページ横はみ出しなし。文字サイズ200%でも確認。大きな図は内部横スクロール。スクリーンショットを目視確認|
|コントラスト|本文・補助・リンク・全構文ハイライト色を背景に対して計算し4.5:1以上。WCAG全体適合の宣言ではない|
|JS無効|本文、画像、展開済み目次、9図のソースが表示。Copy操作は作られない|
|異常系|欠落Pandoc、不正UTF-8、欠落資産、入力と同一出力／ハードリンク、出力先異常、Windows出力ロック、Unix読み取り／書き込み権限、Pandoc writer失敗で既存HTML維持。一時出力を清掃|
|--open失敗|生成成功を維持し、警告と保存先を表示|
|配布|npm pack→一時prefixへtgzをoffline導入。元src/assets/vendorを退避してdoctor・変換・npm binを実行。Windows/Ubuntuとも成功。npm link未使用|
|容量|ブラウザーfixture（9図・6画像・長いコード・全ライセンス）のHTMLは約5.92 MB。固定の容量／速度保証ではない|

## 確定した境界と修正理由

- 数式用拡張は `gfm-tex_math_dollars-tex_math_gfm-yaml_metadata_block` で無効化。生HTMLはPandoc ASTのRawノードを文字表示へ置換。Markdownパーサーの追加なし。
- Pandoc 3.8は画像のエンコード済みfile URIで日本語・記号パスを解決できなかったため、ASTにネイティブ絶対パスを渡す。画像埋め込み自体はPandocのまま。
- WSL/DrvFSでは空でない一時フォルダーの再帰削除開始時にEACCESが出る場合があったため、専用一時フォルダー内のファイルを先に消してからフォルダーを削除する。Windowsの一時ロックには限定回数の再試行。
- Mermaidの独自config/CSS、画像・アイコン入力は非対応の図としてソース付きエラーにする。外部参照・表示設定の上書きを持ち込まないための最小制限。別パーサーや追加依存は導入しない。
- npmのWindows `.cmd` は導入prefixに `&`・括弧があると失敗した。通常prefixのshimと特殊prefixのNode直接起動を確認。入力／出力の記号付きパスとは区別し、独自shimは作らない。

## 未実施・保証しない項目

- GitHub-hosted Windows/Ubuntu CIの実行。ワークフローは作成済みだが、このフォルダーにはGitリポジトリ／公開先がないため、リモートへpushして実行していない。
- WSL以外のネイティブUbuntu実機。Ubuntu 24.04のCIが補完する予定。
- VS Codeの実ウィンドウからタスクを起動する操作。提供タスクと同じNode直接起動方式は両OS・配布物で検証済み。
- 実ブラウザーUIのズーム操作、ブラウザーの権限ダイアログを人が拒否する操作、成功したOSクリップボード内容の読戻し。自動試験でのreflow／文字拡大／権限拒否とは区別。
- `--open` の既定ブラウザーが前面へ開くこと。失敗時の契約は検証済み。
- UNC、ネットワーク共有、Windows拡張長パス、特殊デバイス、全Mermaid図種、任意SVGの完全検証。

公開Release・npm registry公開は行っていません。通常変換用ブラウザー、外部画像取得、独自バンドラー、常駐サーバー、独自VS Code拡張は含めていません。
