/* mdh — MIT License; see the distributed LICENSE. */
(() => {
  for (const pre of document.querySelectorAll('main pre')) {
    if (pre.closest('.mdh-diagram')) continue;
    const code = pre.querySelector('code');
    if (!code) continue;
    const container = pre.parentElement.classList.contains('sourceCode') ? pre.parentElement : pre;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    container.before(wrapper); wrapper.append(container);
    const tools = document.createElement('div'); tools.className = 'code-tools';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Copy';
    const status = document.createElement('span'); status.className = 'copy-status'; status.setAttribute('role', 'status');
    tools.append(button, status); wrapper.prepend(tools);
    button.addEventListener('click', async () => {
      status.textContent = '';
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code.textContent);
        status.textContent = 'コピーしました';
      } catch {
        const range = document.createRange(); range.selectNodeContents(code);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        status.textContent = '自動コピーできません。コードを選択しました。Ctrl+C（Macは⌘C）でコピーしてください。';
      }
    });
  }
  let tocIndex = 0;
  for (const li of document.querySelectorAll('#mdh-toc li')) {
    const children = li.querySelector(':scope > ul');
    if (!children) continue;
    // IDs belong only to controls; heading IDs/TOC links remain Pandoc's output.
    let id;
    do { id = `mdh-toc-children-${++tocIndex}`; } while (document.getElementById(id));
    children.id = id;
    const link = li.querySelector(':scope > a');
    const button = document.createElement('button'); button.type = 'button'; button.textContent = '−';
    button.setAttribute('aria-label', `${link?.textContent || '目次'}の子項目を開閉`);
    button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-controls', id);
    button.addEventListener('click', () => { children.hidden = !children.hidden; button.setAttribute('aria-expanded', String(!children.hidden)); button.textContent = children.hidden ? '+' : '−'; });
    li.prepend(button);
  }

  async function diagrams() {
    const figures = document.querySelectorAll('.mdh-diagram');
    if (!figures.length) return;
    let initError;
    try {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', layout: 'dagre', look: 'classic',
        fontFamily: 'system-ui, Segoe UI, Yu Gothic, Meiryo, sans-serif',
        themeVariables: { background: '#142139', primaryColor: '#223d64', primaryTextColor: '#e2e8f0', primaryBorderColor: '#60a5fa', lineColor: '#94a3b8', secondaryColor: '#25364d', tertiaryColor: '#1c2e48', tertiaryTextColor: '#e2e8f0', noteBkgColor: '#25364d', noteTextColor: '#e2e8f0', actorBkg: '#223d64', actorTextColor: '#e2e8f0', signalColor: '#e2e8f0', signalTextColor: '#e2e8f0' } });
    } catch (e) { initError = e; }
    let index = 0;
    for (const figure of figures) {
      const source = figure.querySelector('.diagram-source');
      const status = figure.querySelector('.diagram-status');
      const drawing = document.createElement('div'); figure.append(drawing);
      try {
        if (initError) throw initError;
        if (figure.dataset.unsupported) throw new Error('外部画像・アイコン・独自設定/CSSを含むMermaidは非対応です。通常のMarkdown画像を使用してください。');
        let id;
        do { id = `mdh-mermaid-${++index}`; } while (document.getElementById(id));
        const result = await window.mermaid.render(id, source.textContent, drawing);
        drawing.innerHTML = result.svg;
        const svg = drawing.querySelector('svg');
        if (!svg) throw new Error('SVGが生成されませんでした。');
        const width = svg.viewBox.baseVal.width;
        if (width > 0) { svg.style.width = `${Math.ceil(width)}px`; svg.style.maxWidth = 'none'; }
        source.hidden = true; status.hidden = true; figure.dataset.result = 'ok';
      } catch (e) {
        drawing.remove(); source.hidden = false;
        status.textContent = `Mermaid描画エラー: ${e.message || String(e)}`;
        figure.dataset.result = 'error';
      }
    }
  }
  diagrams().finally(() => { document.documentElement.dataset.mdhReady = 'true'; });
})();
