import { chromium, firefox } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { convert } from '../src/convert.js';

const root = path.resolve(process.env.MDH_TEST_OUTPUT || '.test-output/browser'); await mkdir(root, { recursive: true });
const source = path.join(root, 'source'); await mkdir(source, { recursive: true });
let markdown = await readFile('tests/fixtures/sample.md', 'utf8');
markdown += '\n```text\n' + 'long line '.repeat(150) + '\n```\n';
markdown += '\n```mermaid\nflowchart LR\n' + Array.from({ length: 18 }, (_, i) => `A${i}[日本語の長い図${i}] --> A${i + 1}`).join('\n') + '\n```\n';
await writeFile(path.join(source, 'sample.md'), markdown);
for (const name of ['image.svg','image.png','image.jpg','image.webp','image.gif']) await copyFile(`tests/fixtures/${name}`, path.join(source, name));
await convert(path.join(source, 'sample.md'), path.join(root, 'alone.html'));
await rm(source, { recursive: true, maxRetries: 6, retryDelay: 150 });
const url = pathToFileURL(path.join(root, 'alone.html')).href;
for (const type of [chromium, firefox]) {
  const browser = await type.launch();
  try {
    const context = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 } });
    const page = await context.newPage(); const requests = [], pageErrors = [];
    page.on('request', r => { if (!/^(?:file|data):/.test(r.url())) requests.push(r.url()); });
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.addInitScript(() => { window.csp=[];document.addEventListener('securitypolicyviolation',e=>window.csp.push(`${e.violatedDirective}: ${e.blockedURI}`)); });
    await page.goto(url); await page.waitForSelector('html[data-mdh-ready="true"]', { timeout: 60000 });
    assert.equal(await page.locator('.mdh-diagram[data-result="ok"] svg').count(), 8);
    assert.equal(await page.locator('.mdh-diagram[data-result="error"]').count(), 1);
    assert.match(await page.locator('.mdh-diagram[data-result="error"]').textContent(), /Mermaid描画エラー.*flowchart/s);
    assert(await page.locator('img').evaluateAll(images=>images.length===6 && images.every(i=>i.complete && i.naturalWidth>0)));
    assert.deepEqual(requests, []); assert.deepEqual(await page.evaluate(()=>window.csp), []); assert.deepEqual(pageErrors, []);
    assert.equal(await page.evaluate(()=>window.unwanted), undefined);
    // Pandoc-generated links all resolve, including repeated Japanese headings.
    assert(await page.locator('#mdh-toc a').evaluateAll(links=>links.every(a=>document.getElementById(decodeURIComponent(a.hash.slice(1))))));
    const toggle = page.locator('#mdh-toc button').first(); await toggle.focus(); await page.keyboard.press('Space');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false'); await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    const code = page.locator('.code-block').filter({ hasText: 'leading spaces' });
    const expected = await code.locator('pre code').textContent();
    // First test the exact text passed to the Clipboard API; do not imply OS permission success.
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}}));
    await code.getByRole('button', { name: 'Copy', exact: true }).click();
    assert.equal(await page.evaluate(()=>window.copied), expected); assert.match(expected, /^  leading spaces\ntrailing spaces  \n/);
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Denied','NotAllowedError');}}}));
    await code.getByRole('button', { name: 'Copy', exact: true }).click();
    assert.match(await code.locator('.copy-status').textContent(), /Ctrl\+C/);
    assert(!(await code.locator('.copy-status').textContent()).includes('コピーしました'));
    assert.equal((await page.evaluate(()=>window.getSelection().toString())).replaceAll('\r\n','\n'), expected);
    if (type === chromium) {
      // Also exercise an actual browser permission denial, not just a rejected stub.
      await page.evaluate(()=>{delete navigator.clipboard;});
      const cdp=await context.newCDPSession(page);
      const {targetInfo}=await cdp.send('Target.getTargetInfo');
      await cdp.send('Browser.setPermission',{permission:{name:'clipboard-write'},setting:'denied',browserContextId:targetInfo.browserContextId});
      await code.getByRole('button',{name:'Copy',exact:true}).click();
      await code.locator('.copy-status').filter({hasText:'Ctrl+C'}).waitFor();
      assert.match(await code.locator('.copy-status').textContent(),/Ctrl\+C/);
      const permission=await page.evaluate(()=>navigator.permissions.query({name:'clipboard-write'}).then(p=>p.state));
      assert.equal(permission,'denied');
    }
    await page.evaluate(()=>window.getSelection().removeAllRanges());
    await page.locator('.mdh-diagram').first().screenshot({path:path.join(root,`${type.name()}-diagram.png`)});
    await page.locator('.mdh-diagram').nth(5).screenshot({path:path.join(root,`${type.name()}-gantt.png`)});
    for (const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:683,height:384},{width:375,height:812}]) {
      await page.setViewportSize(viewport);
      await page.evaluate(()=>window.scrollTo(0,0));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth), `page overflow at ${viewport.width}`);
      assert(await page.locator('.mdh-diagram[data-result="ok"]').last().evaluate(el=>el.scrollWidth>el.clientWidth));
      await page.screenshot({path:path.join(root, `${type.name()}-${viewport.width}.png`), fullPage:false});
    }
    await page.setViewportSize({width:1366,height:768});
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'200% font size overflow');
    await page.screenshot({path:path.join(root,`${type.name()}-text-200.png`)});
    await context.close();
    const noJS = await browser.newContext({ offline: true, javaScriptEnabled: false });
    const plain = await noJS.newPage(); await plain.goto(url);
    assert(await plain.locator('img').evaluateAll(images=>images.every(i=>i.complete && i.naturalWidth>0)));
    assert.equal(await plain.locator('.diagram-source:visible').count(), 9);
    assert(await plain.locator('#mdh-toc a').count()>0); assert.equal(await plain.locator('.code-tools').count(),0);
    await noJS.close();
    console.log(`${type.name()} ${browser.version()}: offline/no-source, 6 diagram families, error isolation, CSP, clipboard denial, TOC, viewports, no-JS: PASS`);
  } finally { await browser.close(); }
}
