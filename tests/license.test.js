import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkAssets } from '../src/assets.js';
test('pinned vendor integrity, source maps, license coverage and theme contrast', async()=>{
  assert.equal(await checkAssets(),'Mermaid 12.0.0');
  const js=await readFile('vendor/mermaid.min.js','utf8');
  assert(!/sourceMappingURL\s*=/.test(js)); assert(js.includes('Bundled license information'));
  const notices=await readFile('vendor/mermaid-notices.txt','utf8');
  for (const text of ['Mermaid','dompurify@3.4.12','elkjs@0.9.3','Eclipse Public License','Apache License','lodash-es@4.18.1']) assert(notices.includes(text),text);
  const theme=JSON.parse(await readFile('assets/syntax.theme','utf8'));
  const luminance=hex=>hex.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  for(const color of ['#e2e8f0','#94a3b8','#60a5fa',...Object.values(theme['text-styles']).map(s=>s['text-color'])]) {
    for(const bg of ['#0f172a','#101b2e']) assert(contrast(color,bg)>=4.5,`${color} on ${bg}`);
  }
});
