import { chromium, firefox } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { convert, resource } from '../src/convert.js';

const outputDir = process.env.MDH_TEST_OUTPUT ? path.resolve(process.env.MDH_TEST_OUTPUT) : await mkdtemp(path.join(tmpdir(), 'mdh-browser-'));
await mkdir(outputDir, { recursive: true });
const source = path.join(outputDir, 'source'); await mkdir(source, { recursive: true });
const input = path.join(source, 'sample.md'), output = path.join(outputDir, 'alone.html');
async function viewerFits(page) {
  assert(await page.locator('.diagram-viewer-stage').evaluate(stage => {
    const box = stage.getBoundingClientRect(), svg = stage.querySelector('svg').getBoundingClientRect();
    const dialog = stage.closest('dialog');
    return svg.width > 0 && svg.height > 0 && svg.left >= box.left - 1 && svg.top >= box.top - 1 && svg.right <= box.right + 1 && svg.bottom <= box.bottom + 1 &&
      getComputedStyle(stage).overflow === 'hidden' && dialog.scrollWidth <= dialog.clientWidth && dialog.scrollHeight <= dialog.clientHeight;
  }), 'viewer fits the entire diagram without scrollbars');
}

async function checkImages(page) {
  assert(await page.locator('#mdh-content img').evaluateAll(images => images.length === 4 && images.every(image => {
    const box = image.getBoundingClientRect(), frame = image.parentElement.getBoundingClientRect();
    return image.complete && image.naturalWidth > 0 && image.src.startsWith('data:') &&
      box.width > 0 && box.width <= frame.width + 1 &&
      Math.abs(box.height - box.width * image.naturalHeight / image.naturalWidth) < 1;
  })), 'Markdown and HTML images load offline, fit their container and keep their proportions');
  // Pandoc 3.8 also wraps standalone Markdown images in figures.
  // Select authored HTML examples independently of that output difference.
  const figures = page.locator('#mdh-content figure').filter({ has: page.locator('figcaption', { hasText: /図 [12]:/ }) });
  assert.equal(await figures.count(), 2);
  assert(await figures.first().locator('img').evaluate(image => {
    const fraction = parseFloat(image.getAttribute('width')) / 100;
    return Math.abs(image.getBoundingClientRect().width - image.closest('figure').clientWidth * fraction) < 1;
  }), 'authored percentage width is relative to the figure');
  assert.match(await figures.first().locator('figcaption').textContent(), /図 1: サンプル画像/);
}

async function checkDiagramViewer(page, figure) {
  const svgId = await figure.locator('svg').getAttribute('id');
  const opener = figure.getByRole('button', { name: '拡大表示', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Mermaid 図の拡大表示' }), stage = dialog.locator('.diagram-viewer-stage');
  assert(await dialog.isVisible()); assert.equal(await dialog.getAttribute('data-zoom'), '1');
  assert.equal(await dialog.locator('svg').getAttribute('id'), svgId);
  assert.equal(await figure.locator('svg').count(), 0, 'SVG is moved instead of cloned');
  assert.equal(await page.locator('svg').evaluateAll((svgs, id) => svgs.filter(svg => svg.id === id).length, svgId), 1);
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
  await viewerFits(page);
  await dialog.getByRole('button', { name: '拡大', exact: true }).click();
  assert(Number(await dialog.getAttribute('data-zoom')) > 1);
  const drawing = stage.locator('.diagram-drawing'), beforePan = await drawing.getAttribute('style');
  const box = await stage.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 70, y - 70, { steps: 3 }); await page.mouse.up();
  assert.notEqual(await drawing.getAttribute('style'), beforePan, 'zoomed drawing can be dragged');
  const beforeWheel = Number(await dialog.getAttribute('data-zoom'));
  await page.mouse.wheel(0, -100);
  await page.waitForFunction(previous => Number(document.querySelector('.diagram-viewer').dataset.zoom) > previous, beforeWheel);
  await stage.focus(); await page.keyboard.press('Home');
  assert.equal(await dialog.getAttribute('data-zoom'), '1'); await viewerFits(page);
  await page.keyboard.press('+'); assert(Number(await dialog.getAttribute('data-zoom')) > 1);
  await dialog.getByRole('button', { name: '図全体を表示' }).click(); await viewerFits(page);
  await dialog.getByRole('button', { name: '拡大表示を閉じる' }).focus(); await page.keyboard.press('Tab');
  assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'keyboard focus stays inside the modal');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(await figure.locator('svg').getAttribute('id'), svgId);
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
  assert(await opener.evaluate(el => el === document.activeElement), 'closing restores focus to the open button');
}

const diagrams = [
  '---\nconfig:\n  theme: neutral\n---\nflowchart LR\nA[日本語の資料] --> B[単一HTML]\nclassDef emphasis fill:#e8f1fb,stroke:#2f6fba;\nclass A emphasis;',
  '%%{init: {"sequence":{"showSequenceNumbers":true}}}%%\nsequenceDiagram\nparticipant A as 利用者\nparticipant B as 変換\nA->>B: 保存済み資料\nB-->>A: HTML',
  'classDiagram\nDocument <|-- Markdown\nDocument : +title',
  'stateDiagram-v2\n[*] --> 保存\n保存 --> 変換\n変換 --> [*]',
  'erDiagram\nDOCUMENT ||--o{ IMAGE : contains',
  'gantt\ntitle 検証予定\ndateFormat YYYY-MM-DD\nsection 作業\n検証 :a1, 2026-10-01, 1d',
  'flowchart LR\nA -->[',
  'flowchart LR\n' + Array.from({ length: 18 }, (_, i) => `A${i}[日本語の長い図${i}] --> A${i + 1}`).join('\n'),
  'flowchart TD\n' + Array.from({ length: 12 }, (_, i) => `S${i}[縦に長い手順${i}] --> S${i + 1}`).join('\n'),
];
const documentTitle = '日本語の設計メモ — 書式・画像・Mermaid の表示確認';
let markdown = `---\ntitle: ${documentTitle}\n---\n# 日本語の設計メモ\n\n## 入力と出力\n\n![図](画像.svg)\n\n![PNG](image.png)\n\n`;
markdown += '<figure style="text-align: center;">\n    <img src="image.png" alt="サンプル画像" width="65%" height="65%" />\n    <figcaption>図 1: サンプル画像</figcaption>\n</figure>\n\n';
markdown += '1. 手順内の図\n\n    <figure style="text-align: center;">\n        <img src="image.png" alt="幅指定のサンプル画像" style="width: 640px; height: 180px;" />\n        <figcaption>図 2: 幅指定のサンプル画像</figcaption>\n    </figure>\n\n';
markdown += '### 長い目次項目でも文字を切らずに折り返して表示するための確認\n\n本文です。\n\n';
markdown += '#### 見出し 4\n\n本文です。\n\n##### 見出し 5\n\n本文です。\n\n###### 見出し 6\n\n本文です。\n\n| 項目 | 内容 |\n| --- | --- |\n| A | `table-code` |\n| B | 説明 |\n\n本文の `inline-code` と [リンクの `link-code`](#入力と出力) です。\n\n';
markdown += '```unknown-language\n  leading spaces\ntrailing spaces  \n```\n\n';
markdown += '<script>window.documentScript = true;</script>\n\n';
markdown += await readFile(resource('tests/fixtures/formatting.md'), 'utf8') + '\n\n';
markdown += diagrams.map((code, i) => `### 図 ${i + 1}\n\n\`\`\`mermaid\n${code}\n\`\`\`\n`).join('\n');
markdown += '\n```text\n' + 'long line '.repeat(150) + '\n```\n';
await writeFile(input, markdown);
await writeFile(path.join(source, '画像.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#60a5fa"/><text x="5" y="25">ローカル画像</text></svg>');
await writeFile(path.join(source, 'image.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));

try {
  await convert(input, output, { numberSections: true });
  await rm(source, { recursive: true });
  const url = pathToFileURL(output).href;
  for (const type of [chromium, firefox]) {
    const browser = await type.launch();
    try {
      const context = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 } });
      const page = await context.newPage(), requests = [], errors = [];
      page.on('request', r => { if (!/^(?:file|data):/.test(r.url())) requests.push(r.url()); });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url); await page.waitForSelector('html[data-mdh-ready="true"]', { timeout: 60000 });
      assert.equal(await page.locator('.mdh-diagram[data-result="ok"] svg').count(), 8);
      assert.equal(await page.getByRole('button', { name: '拡大表示', exact: true }).count(), 8);
      assert.equal(await page.locator('.mdh-diagram[data-result="error"]').count(), 1);
      assert.match(await page.locator('.mdh-diagram[data-result="error"]').textContent(), /Mermaid 描画エラー/);
      assert.equal(await page.locator('.mdh-diagram[data-result="error"] .diagram-open').count(), 0);
      await checkImages(page);
      assert.deepEqual(requests, []); assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => window.documentScript), true, 'raw HTML scripts retain standard Pandoc behavior');
      assert.equal(await page.title(), documentTitle);
      assert.equal((await page.locator('.document-title').textContent()).replace(/\s+/g, ' ').trim(), documentTitle);
      assert.equal(await page.locator('.document-title .header-section-number').count(), 0);
      assert.doesNotMatch(await page.locator('#mdh-toc').textContent(), /書式・画像・Mermaid/);
      const htmlTable = page.locator('#mdh-content table').filter({ has: page.locator('caption', { hasText: 'サンプル表' }) });
      assert.equal(await htmlTable.locator('tbody tr').count(), 3);
      assert.equal(await htmlTable.locator('td[rowspan="2"]').count(), 1);
      assert.equal(await htmlTable.locator('td[colspan="4"]').count(), 1);
      assert.equal(await htmlTable.locator('td strong code').textContent(), 'sample');
      assert.equal(await htmlTable.locator('td code').filter({ hasText: /^value$/ }).count(), 1);
      assert.equal(await htmlTable.locator('thead th').count(), 4);
      assert(await page.locator('#mdh-content table').filter({ has: page.locator('code', { hasText: 'table-code' }) }).isVisible());
      assert(await page.locator('#mdh-content strong').filter({ hasText: /^【例】$/ }).isVisible());
      const red = page.locator('#mdh-content span').filter({ hasText: /^色付きの強調$/ });
      assert.match(await red.getAttribute('style'), /color:\s*red/);
      assert(await red.locator('strong').isVisible());
      const details = page.locator('#mdh-content details');
      assert.equal(await details.locator('table').isVisible(), false);
      await details.locator('summary').click(); assert(await details.locator('table').isVisible());
      await details.locator('summary').click(); assert.equal(await details.locator('table').isVisible(), false);
      const wrappedLink = page.locator('#mdh-toc a').filter({ hasText: '長い目次項目' });
      assert(await wrappedLink.evaluate(link => {
        const range = document.createRange(); range.selectNodeContents(link);
        const text = range.getBoundingClientRect(), box = link.getBoundingClientRect();
        return text.bottom <= box.bottom + 1 && link.scrollWidth <= link.clientWidth;
      }), 'wrapped navigation text must fit without being clipped');
      await page.emulateMedia({ media: 'print' });
      await page.waitForFunction(() => matchMedia('print').matches, undefined, { polling: 50 });
      await checkImages(page);
      assert(await page.locator('.table-scroll, .code-block pre, .mdh-diagram').evaluateAll(wrappers => wrappers.every(el => {
        const style = getComputedStyle(el);
        return style.overflowX === 'visible' && style.overflowY === 'visible';
      })), 'printed tables, code and diagrams are not clipped by scroll frames');
      await page.emulateMedia({ media: 'screen' });
      await page.waitForFunction(() => matchMedia('screen').matches, undefined, { polling: 50 });
      assert(await page.locator('#mdh-toc a').evaluateAll(links => links.every(a => document.getElementById(decodeURIComponent(a.hash.slice(1))))));
      for (const level of [4, 5, 6]) {
        const id = await page.locator(`#mdh-content h${level}`).first().getAttribute('id');
        const links = await page.locator('#mdh-toc a').evaluateAll((anchors, id) => anchors.filter(a => decodeURIComponent(a.hash.slice(1)) === id).length, id);
        assert.equal(links, level === 4 ? 1 : 0, `TOC includes H4 but excludes H5/H6 (h${level})`);
      }
      assert.equal(await page.locator('#mdh-toc a[aria-current="location"]').count(), 1);
      assert(await page.locator('#mdh-toc a[aria-current="location"]').evaluate(link => {
        for (let item = link.closest('li'); item; item = item.parentElement.closest('li')) {
          if (item.classList.contains('toc-branch') && !item.classList.contains('is-active-path')) return false;
        }
        return true;
      }), 'active section marks its ancestor path');
      const toggle = page.locator('#mdh-toc button').first();
      await toggle.focus(); await page.keyboard.press('Space');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator(`#${await toggle.getAttribute('aria-controls')}`).isVisible(), false);
      await page.keyboard.press('Enter');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert(await page.locator(`#${await toggle.getAttribute('aria-controls')}`).isVisible());
      const code = page.locator('.code-block').filter({ hasText: 'leading spaces' });
      const expected = await code.locator('pre code').textContent();
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied = text; } } }));
      await code.getByRole('button', { name: 'Copy', exact: true }).click();
      assert.equal(await page.evaluate(() => window.copied), expected); assert.match(expected, /^  leading spaces\ntrailing spaces  /);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } }));
      await code.getByRole('button', { name: 'Copy', exact: true }).click();
      assert.match(await code.locator('.copy-status').textContent(), /Ctrl\+C/);
      assert.equal((await page.evaluate(() => window.getSelection().toString())).replaceAll('\r\n', '\n'), expected);
      await page.evaluate(() => window.getSelection().removeAllRanges());
      const wideFigure = page.locator('.mdh-diagram[data-result="ok"]').nth(6), tallFigure = page.locator('.mdh-diagram[data-result="ok"]').last();
      await checkDiagramViewer(page, wideFigure);
      await checkDiagramViewer(page, tallFigure);
      assert.equal(await page.locator('dialog.diagram-viewer').count(), 1, 'all diagrams share one viewer');
      await wideFigure.getByRole('button', { name: '拡大表示', exact: true }).click();
      await page.setViewportSize({ width: 900, height: 600 }); await viewerFits(page);
      await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
      assert.equal(await page.getByRole('dialog').count(), 0, 'printing restores the drawing to the document');
      assert.equal(await wideFigure.locator('svg').count(), 1);
      for (const viewport of [{ width: 1366, height: 768 }, { width: 375, height: 812 }]) {
        await page.setViewportSize(viewport);
        await checkImages(page);
        assert(await page.locator('.document-title').evaluate(el => {
          const box = el.getBoundingClientRect(), card = el.closest('header').getBoundingClientRect();
          return el.scrollWidth <= el.clientWidth && box.left >= card.left && box.right <= card.right && box.bottom <= card.bottom;
        }), 'title wraps inside its card on desktop and mobile');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow at ${viewport.width}`);
        assert(await page.locator('.table-scroll').evaluateAll(wrappers => wrappers.every(el => el.clientWidth === 0 || el.getBoundingClientRect().right <= innerWidth)), 'wide tables remain inside the page and scroll locally');
        assert(await page.locator('.mdh-diagram[data-result="ok"]').evaluateAll(figures => figures.every(el => el.scrollWidth <= el.clientWidth)), 'inline diagrams fit without horizontal scrolling');
        assert(await page.locator('.mdh-diagram[data-result="ok"] svg').evaluateAll(svgs => svgs.every(svg => {
          const rect = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
          return rect.width > 0 && rect.height > 0 && rect.height <= innerHeight &&
            Math.abs(rect.height - rect.width * view.height / view.width) < 1;
        })), 'inline diagrams fit the viewport height without distorting their proportions');
        const previewHeight = await tallFigure.locator('svg').evaluate(svg => svg.getBoundingClientRect().height);
        await tallFigure.getByRole('button', { name: '拡大表示', exact: true }).click(); await viewerFits(page);
        assert(await page.locator('.diagram-viewer-stage svg').evaluate((svg, height) => svg.getBoundingClientRect().height > height, previewHeight), 'viewer provides more room than the inline preview');
        await page.getByRole('button', { name: '拡大表示を閉じる' }).click();
        await wideFigure.getByRole('button', { name: '拡大表示', exact: true }).click(); await viewerFits(page);
        await page.getByRole('button', { name: '拡大表示を閉じる' }).click();
        if (process.env.MDH_TEST_OUTPUT) await page.screenshot({ path: path.join(outputDir, `${type.name()}-${viewport.width}.png`) });
      }
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.evaluate(() => document.documentElement.style.fontSize = '200%');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '200% font size overflow');
      await context.close();
      const noJS = await browser.newContext({ offline: true, javaScriptEnabled: false });
      const plain = await noJS.newPage(); await plain.goto(url);
      assert.equal((await plain.locator('.document-title').textContent()).replace(/\s+/g, ' ').trim(), documentTitle);
      await checkImages(plain);
      assert.equal(await plain.locator('.diagram-source:visible').count(), 9);
      assert.equal(await plain.locator('.diagram-open').count(), 0);
      assert(await plain.locator('#mdh-toc a').count() > 0); assert.equal(await plain.locator('.code-tools').count(), 0);
      assert(await plain.locator('#mdh-content table').evaluateAll(tables => tables.every(table => table.rows.length > 0)), 'semantic tables remain readable without JavaScript');
      await noJS.close();
      const touch = await browser.newContext({ offline: true, hasTouch: true, viewport: { width: 375, height: 812 } });
      const touchPage = await touch.newPage(); await touchPage.goto(url);
      await touchPage.waitForSelector('html[data-mdh-ready="true"]', { timeout: 60000 });
      assert(await touchPage.evaluate(() => matchMedia('(pointer:coarse)').matches));
      await touchPage.locator('.diagram-open').last().tap(); await viewerFits(touchPage);
      await touchPage.getByRole('button', { name: '拡大', exact: true }).tap();
      assert(Number(await touchPage.getByRole('dialog').getAttribute('data-zoom')) > 1);
      await touchPage.getByRole('button', { name: '拡大表示を閉じる' }).tap();
      await touch.close();
      console.log(`${type.name()}: offline resources, Mermaid/viewer, copy, TOC, HTML/tables, responsive/print, no-JS: PASS`);
    } finally { await browser.close(); }
  }
} finally {
  if (!process.env.MDH_TEST_OUTPUT) await rm(outputDir, { recursive: true, force: true });
}
