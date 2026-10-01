# 検証記録

2026-10-02。導入方式をgit clone + setup + PATHへ変更。旧tgz配布の検証結果は現行方式の合格根拠に使わない。

## 確認対象

- Windows build 26300、Ubuntu 24.04.5 / WSL2。
- Node.js 24.21.0、Pandoc 3.8、Mermaid 12.0.0。
- 開発専用Playwright 1.58.2、Chromium 145.0.7632.6、Firefox 146.0.1。
- JS本体と必要なライセンスを固定ハッシュ付きで上流から取得。Gitには本体を置かない。

## 簡素化後にも再確認した変換機能

一般Markdown、日本語・BOM/CRLF、パス、外部／欠落画像拒否、入力保護、既存出力維持、コピー文字列と拒否、目次リンク・キーボード開閉、JS無効表示。

フロー・シーケンス・クラス・状態・ER・Ganttと不正図、PNG/JPEG/WebP/GIF/SVGを両OS・両ブラウザーで確認。新規offlineコンテキスト、元資料削除、file://で表示用要求とCSP違反は0。

1366×768、1920×1080、狭幅、文字サイズ200%で横はみ出しなし。本文・補助・ハイライト色のコントラスト4.5:1以上。WCAG全体への適合宣言ではない。

現行GitHub CI: [clone/setup方式のWindows・Ubuntu実行結果](https://github.com/ryoheiii/markdown-to-html/actions/runs/36891303183)。

## 現行導入方式

- 初回setupで固定版を取得・SHA-256検証。取得済みキャッシュでは通信を禁止してもsetup成功。
- 公開リポジトリを新しい場所へ `git clone --depth 1` し、setup・PATH登録・doctor・サンプル変換に成功。取得した履歴は1コミットでvendorディレクトリなし。
- 通常利用にnode_modulesは不要。日本語・空白・&・括弧を含むclone先を別ディレクトリに置き、異なるcwdからbinの入口で変換。
- setup資産がない場合は再実行方法を表示し、既存HTMLを維持。
- CLI／資産テスト18件: Windows 15成功・Unix専用3skip、Ubuntu/WSL 17成功・Windows専用1skip。失敗0。
- Windows／Ubuntu・WSLのChromiumとFirefoxで、変更後のオフライン表示・コピー拒否・画像・図・目次を再確認。
- WindowsのDropbox同期先では一時フォルダー削除のEBUSYが1回発生。ブラウザー試験の出力を通常のTEMPへ移して成功。同期ソフトによるファイルロックは残る環境制限。

## 未実施・範囲外

VS Codeの実UIタスク操作、実ブラウザーUIのズーム操作、OSクリップボード成功書き込みの読戻し、--openの既定ブラウザー前面表示は未確認。コピーの成功文字列は模擬、拒否はChromiumの実権限と両ブラウザーの模擬拒否で確認する。

UNC、ネットワーク共有、Windows拡張長パス、特殊デバイス、全Mermaid図種、任意SVGの完全検証は保証しない。
