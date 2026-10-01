// Optional maintainer utility for deterministic, fictional image fixtures.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  for(const [extension,mime] of [['png','image/png'],['jpg','image/jpeg'],['webp','image/webp']]) {
    const data=await page.evaluate(mime=>{const c=document.createElement('canvas');c.width=100;c.height=60;const ctx=c.getContext('2d');ctx.fillStyle='#60a5fa';ctx.fillRect(0,0,100,60);ctx.fillStyle='#0f172a';ctx.fillRect(25,15,50,30);return c.toDataURL(mime).split(',')[1];},mime);
    await writeFile(`tests/fixtures/image.${extension}`,Buffer.from(data,'base64'));
  }
  await writeFile('tests/fixtures/image.gif',Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
} finally {await browser.close();}
