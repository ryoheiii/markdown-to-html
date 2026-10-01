## 日本語の設計メモ

これは架空のサンプルです。**強調**、*斜体*、~~取り消し~~、[Webリンク](https://example.com)、[見出しへ](#日本語の設計メモ)。

### 入力と出力

- 項目
  - 入れ子
- [x] 完了
- [ ] 未完了

1. 保存する
2. 変換する

> 引用文
>
> ```mermaid
> flowchart LR
>   A[日本語の資料] --> B[単一HTML]
> ```

|項目|説明|
|---|---|
|画像|![構成](image.svg)|
|参照形式|![画像][picture]|

[picture]: image.svg

PNG: ![PNG](image.png) JPEG: ![JPEG](image.jpg) WebP: ![WebP](image.webp) GIF: ![GIF](image.gif)

### 入力と出力

同名見出しにも別々のIDが付く。

##### 階層を飛ばした見出し

```javascript
  const greeting = "こんにちは";
console.log(greeting); // コメント

```

```unknown-language
  leading spaces
trailing spaces  

<script>alert('example')</script>
```

数式はテキスト: $a+b$ と $$c=d$$。

```math
x^2 + y^2 = z^2
```

<script>window.unwanted = true;</script>

<div>生HTMLは文字として表示</div>

````markdown
```mermaid
これは説明用コードであり図ではない
```
````

## 代表図

```mermaid
sequenceDiagram
  participant A as 利用者
  participant B as 変換
  A->>B: 保存済み資料
  B-->>A: HTML
```

```mermaid
classDiagram
  Document <|-- Markdown
  Document : +title
```

```mermaid
stateDiagram-v2
  [*] --> 保存
  保存 --> 変換
  変換 --> [*]
```

```mermaid
erDiagram
  DOCUMENT ||--o{ IMAGE : contains
```

```mermaid
gantt
  title 検証予定
  dateFormat YYYY-MM-DD
  section 作業
  検証 :a1, 2026-10-01, 1d
```

## エラーの後も使える

```mermaid
flowchart LR
  A -->[
```

```mermaid
flowchart LR
  A[後続の図] --> B[表示できる]
```

```text
エラーの後でもコピーできる
```
