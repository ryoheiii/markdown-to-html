# Pandoc 標準の書式 {#pandoc .reference data-kind=sample}

脚注付きの本文[^note]と [内部リンク](#pandoc){.reference title="説明"}。

[^note]: 脚注の説明。

用語
: 定義リストの説明。

1. 番号付きリスト
    - 入れ子の項目
    - 続きの項目

> 引用と **強調**。

数式: $a^2 + b^2 = c^2$。

$$
E = mc^2
$$

| 左寄せ | 右寄せ |
| :--- | ---: |
| 本文 | 42 |

```javascript {#example .numberLines}
const message = '日本語';
console.log(message);
```

<div class="raw-html" data-preserved="yes">HTML の内容</div>

<script>globalThis.pandocFixture = true;</script>
