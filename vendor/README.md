# Mermaid vendor

公式フルIIFE `mermaid@12.0.0/dist/mermaid.min.js`。再バンドル・Tiny化・独自forkは行っていません。

- 取得元: https://registry.npmjs.org/mermaid/-/mermaid-12.0.0.tgz
- npm integrity: `sha512-/wQXC9iBxoGV8p3erbvaXs9h77VyLDBH6GdayVjj3hEcSQhFU4N1WUhUppotCEqlIxI2pRMwjwBSwTB1MfZBgQ==`
- 元ファイルサイズ: 5,575,485 bytes
- 固定ハッシュ: `manifest.json`（doctorと変換時に照合）
- 上流のバンドル内ライセンスコメントは保存。外部source map指示はありません。
- `MERMAID-LICENSE` は本体MIT。`mermaid-notices.txt` は上流依存のライセンス全文も含めた表示用集合。EPL-2.0、Apache等をMITへ読み替えません。
- Mermaid内部のELKやKaTeX等を独自に削除していません。mdhはMarkdownの数式拡張を無効化し、数式用処理・フォント資産は追加しません。

更新は公式npmアーカイブを展開してこのファイルをコピーし、ライセンス・配布元・ハッシュを更新してください。`license-sources.json` はリリースタグのpnpm-lockから照合した収集対象です（型専用・複数版も含む広めの集合）。`node tests/collect-notices.js --fetch` は固定した配布元からライセンスを集める保守専用スクリプトで、利用者のインストール・変換からは呼びません。更新後はrisk、CLI、browser、packageの全試験を実行します。
