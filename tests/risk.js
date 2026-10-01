// First feasibility gate; deliberately independent of the converter.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium, firefox } from 'playwright';
const root = resolve('.test-output/risk');
await mkdir(root, { recursive: true });
const source = resolve(root, 'source');
await mkdir(source, { recursive: true });
await writeFile(resolve(source, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>');
const svg = await readFile(resolve(source, 'image.svg'));
const js = await readFile('vendor/mermaid.min.js', 'utf8');
assert(!/<\/script/i.test(js));
await writeFile(resolve(root, 'alone.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><img src="data:image/svg+xml;base64,${svg.toString('base64')}"><div id="results"></div><script>${js}</script><script>
mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',layout:'dagre',look:'classic',fontFamily:'sans-serif'});
(async()=>{for(const [i,code] of ['flowchart LR\\n A[日本語] --> B[単一HTML]', 'not a diagram', 'sequenceDiagram\\n Alice->>Bob: こんにちは'].entries()) {const box=document.createElement('div');document.querySelector('#results').append(box);try{box.innerHTML=(await mermaid.render('risk'+i,code,box)).svg;box.dataset.result='ok';}catch(e){box.textContent='エラー: '+e.message+'\\n'+code;box.dataset.result='error';}}document.body.dataset.done='yes';})();</script>`);
await rm(source, { recursive: true });
for (const type of [chromium, firefox]) {
  const browser = await type.launch();
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const requests = [], violations = [];
    page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
    await page.addInitScript(() => { window.violations=[];document.addEventListener('securitypolicyviolation', e=>window.violations.push(e.violatedDirective)); });
    await page.goto(pathToFileURL(resolve(root, 'alone.html')).href);
    await page.waitForSelector('body[data-done="yes"]');
    assert.equal(await page.locator('[data-result="ok"] svg').count(), 2);
    assert.equal(await page.locator('[data-result="error"]').count(), 1);
    assert(await page.locator('img').evaluate(i=>i.complete && i.naturalWidth===40));
    violations.push(...await page.evaluate(()=>window.violations));
    assert.deepEqual(requests, []); assert.deepEqual(violations, []);
    console.log(`${type.name()} ${browser.version()}: file:// offline, removed source, images, Japanese diagrams, isolated error, zero requests/CSP violations: PASS`);
  } finally { await browser.close(); }
}
