(() => {
  // Layout belongs to the browser; leave Pandoc's HTML and attributes intact.
  for (const table of document.querySelectorAll('#mdh-content table')) {
    if (table.parentElement.classList.contains('table-scroll')) continue;
    const wrapper = document.createElement('div'); wrapper.className = 'table-scroll';
    table.before(wrapper); wrapper.append(table);
  }

  for (const pre of document.querySelectorAll('main pre')) {
    if (pre.closest('.mdh-diagram')) continue;
    const code = pre.querySelector('code');
    if (!code) continue;
    const container = pre.parentElement.classList.contains('sourceCode') ? pre.parentElement : pre;
    const wrapper = document.createElement('div'); wrapper.className = 'code-block';
    container.before(wrapper); wrapper.append(container);
    const tools = document.createElement('div'); tools.className = 'code-tools';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Copy'; button.className = 'copy-button';
    const status = document.createElement('span'); status.className = 'copy-status'; status.setAttribute('role', 'status');
    tools.append(button); wrapper.prepend(tools); wrapper.append(status);
    button.addEventListener('click', async () => {
      status.textContent = '';
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code.textContent);
        status.textContent = 'コピーしました';
      } catch {
        const range = document.createRange(); range.selectNodeContents(code);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        status.textContent = '自動コピーできません。コードを選択しました。Ctrl+C（Mac は ⌘C）でコピーしてください。';
      }
    });
  }

  let tocIndex = 0;
  const toc = document.querySelector('nav[aria-label="目次"]');
  for (const li of toc?.querySelectorAll('li') || []) {
    const children = li.querySelector(':scope > ul');
    if (!children) continue;
    let id;
    do { id = `mdh-toc-children-${++tocIndex}`; } while (document.getElementById(id));
    children.id = id;
    const link = li.querySelector(':scope > a');
    li.classList.add('toc-branch');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'toc-branch-toggle';
    button.setAttribute('aria-label', `${link?.textContent || '目次'}の子項目を開閉`);
    button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-controls', id);
    button.addEventListener('click', () => {
      children.hidden = !children.hidden;
      button.setAttribute('aria-expanded', String(!children.hidden));
    });
    li.prepend(button);
  }
  const links = new Map();
  for (const link of toc?.querySelectorAll('a[href^="#"]') || []) {
    try { links.set(decodeURIComponent(link.hash.slice(1)), link); } catch { /* malformed fragment */ }
  }
  const headings = [...document.querySelectorAll('main :is(h1,h2,h3,h4,h5,h6)[id]')].filter(h => links.has(h.id));
  let scheduled = false;
  const highlight = () => {
    scheduled = false;
    let current = headings[0];
    for (const heading of headings) { if (heading.getBoundingClientRect().top > 100) break; current = heading; }
    for (const [id, link] of links) {
      if (id === current?.id) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    }
    for (const item of toc?.querySelectorAll('.is-active-path') || []) item.classList.remove('is-active-path');
    for (let item = links.get(current?.id)?.closest('li'); item; item = item.parentElement.closest('li')) {
      if (item.classList.contains('toc-branch')) item.classList.add('is-active-path');
    }
  };
  window.addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(highlight); } }, { passive: true });
  window.addEventListener('hashchange', highlight);
  highlight();

  function createDiagramViewer() {
    const dialog = document.createElement('dialog'); dialog.className = 'diagram-viewer';
    dialog.setAttribute('aria-label', 'Mermaid 図の拡大表示');
    const toolbar = document.createElement('div'); toolbar.className = 'diagram-viewer-toolbar';
    const title = document.createElement('strong'); title.textContent = 'Mermaid 図';
    const controls = document.createElement('div'); controls.className = 'diagram-viewer-controls';
    const makeButton = (text, label, handler) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'diagram-button';
      button.textContent = text; button.setAttribute('aria-label', label); button.addEventListener('click', handler);
      controls.append(button); return button;
    };
    const smaller = makeButton('−', '縮小', () => zoomTo(zoom / 1.25));
    const larger = makeButton('＋', '拡大', () => zoomTo(zoom * 1.25));
    const ratio = document.createElement('output'); ratio.className = 'diagram-zoom';
    ratio.setAttribute('aria-label', '全体表示を100%とした倍率'); controls.append(ratio);
    makeButton('全体表示', '図全体を表示', () => { zoom = 1; panX = panY = 0; update(); });
    const close = makeButton('閉じる', '拡大表示を閉じる', () => closeViewer());
    toolbar.append(title, controls);
    const stage = document.createElement('div'); stage.className = 'diagram-viewer-stage'; stage.tabIndex = 0;
    stage.setAttribute('role', 'region'); stage.setAttribute('aria-label', '図の表示領域。ドラッグまたは矢印キーで移動、＋と−で拡大縮小、Homeで全体表示。');
    const hint = document.createElement('p'); hint.className = 'diagram-viewer-hint';
    hint.textContent = '＋／−・ホイールで拡大縮小、ドラッグ・矢印キーで移動。全体表示でリセット、Escで閉じます。';
    dialog.append(toolbar, stage, hint); document.body.append(dialog);
    let active, zoom = 1, panX = 0, panY = 0, drag;
    const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
    const fitScale = () => Math.min(Math.max(1, stage.clientWidth - 24) / active.width, Math.max(1, stage.clientHeight - 24) / active.height);
    function update() {
      if (!active || !dialog.open) return;
      const scale = fitScale() * zoom, width = active.width * scale, height = active.height * scale;
      panX = clamp(panX, Math.max(0, (width - stage.clientWidth) / 2 + 12));
      panY = clamp(panY, Math.max(0, (height - stage.clientHeight) / 2 + 12));
      active.drawing.style.width = `${active.width}px`; active.drawing.style.height = `${active.height}px`;
      active.drawing.style.transform = `translate(${(stage.clientWidth - width) / 2 + panX}px, ${(stage.clientHeight - height) / 2 + panY}px) scale(${scale})`;
      ratio.value = `${Math.round(zoom * 100)}%`; dialog.dataset.zoom = String(zoom);
      smaller.disabled = zoom <= 1; larger.disabled = zoom >= 16;
    }
    function zoomTo(value, x = 0, y = 0) {
      if (!active) return;
      const next = Math.max(1, Math.min(16, value)), factor = next / zoom;
      panX = x - (x - panX) * factor; panY = y - (y - panY) * factor;
      zoom = next; update();
    }
    function restore() {
      if (!active) return;
      const { drawing, placeholder, style, opener, overflow } = active;
      if (style === null) drawing.removeAttribute('style'); else drawing.setAttribute('style', style);
      placeholder.replaceWith(drawing); document.documentElement.style.overflow = overflow;
      opener.setAttribute('aria-expanded', 'false'); active = undefined; drag = undefined;
      stage.classList.remove('is-dragging'); opener.focus({ preventScroll: true });
    }
    function closeViewer() { if (dialog.open) dialog.close(); restore(); }
    dialog.addEventListener('close', () => { if (!dialog.open) restore(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
    window.addEventListener('beforeprint', closeViewer);
    new ResizeObserver(update).observe(stage);
    stage.addEventListener('wheel', event => {
      if (event.ctrlKey || !active) return; // Leave browser zoom available.
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      zoomTo(zoom * (event.deltaY < 0 ? 1.25 : .8), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
    }, { passive: false });
    stage.addEventListener('pointerdown', event => {
      if (!active || drag || event.button !== 0 || event.target.closest('a')) return;
      event.preventDefault(); stage.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY };
      stage.setPointerCapture(event.pointerId); stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      panX = drag.panX + event.clientX - drag.x; panY = drag.panY + event.clientY - drag.y; update();
    });
    const endDrag = () => { drag = undefined; stage.classList.remove('is-dragging'); };
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag); stage.addEventListener('lostpointercapture', endDrag);
    stage.addEventListener('keydown', event => {
      if (!active) return;
      if (['+', '='].includes(event.key)) zoomTo(zoom * 1.25);
      else if (event.key === '-') zoomTo(zoom / 1.25);
      else if (event.key === 'Home') { zoom = 1; panX = panY = 0; update(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        panX += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0;
        panY += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0;
        update();
      } else return;
      event.preventDefault();
    });
    return (drawing, opener, width, height) => {
      if (dialog.open) return;
      const placeholder = document.createElement('div'); placeholder.style.height = `${drawing.getBoundingClientRect().height}px`;
      // Move, rather than clone, the SVG so Mermaid's IDs stay unique.
      active = { drawing, placeholder, opener, width, height, style: drawing.getAttribute('style'), overflow: document.documentElement.style.overflow };
      drawing.replaceWith(placeholder); stage.append(drawing); zoom = 1; panX = panY = 0;
      document.documentElement.style.overflow = 'hidden'; opener.setAttribute('aria-expanded', 'true');
      try { dialog.showModal(); update(); close.focus(); }
      catch (error) { closeViewer(); throw error; }
    };
  }

  async function diagrams() {
    const figures = document.querySelectorAll('.mdh-diagram');
    if (!figures.length) return;
    let initError;
    try {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', layout: 'dagre', look: 'classic',
        fontFamily: getComputedStyle(document.body).fontFamily,
        themeVariables: { background: '#ffffff', primaryColor: '#e8f1fb', primaryTextColor: '#1f2328', primaryBorderColor: '#2f6fba', lineColor: '#59636e', secondaryColor: '#f1f5f9', tertiaryColor: '#f8fafc', tertiaryTextColor: '#1f2328', clusterBkg: '#f6f8fa', clusterBorder: '#d0d7de', edgeLabelBackground: '#ffffff', noteBkgColor: '#fff8c5', noteBorderColor: '#d4a72c', noteTextColor: '#1f2328', actorBkg: '#e8f1fb', actorBorder: '#2f6fba', actorTextColor: '#1f2328', signalColor: '#1f2328', signalTextColor: '#1f2328', labelBoxBkgColor: '#e8f1fb', labelBoxBorderColor: '#2f6fba' } });
    } catch (error) { initError = error; }
    let index = 0, viewer;
    for (const figure of figures) {
      const source = figure.querySelector('.diagram-source'), status = figure.querySelector('.diagram-status');
      const drawing = document.createElement('div'); drawing.className = 'diagram-drawing'; figure.append(drawing);
      try {
        if (initError) throw initError;
        let id;
        do { id = `mdh-mermaid-${++index}`; } while (document.getElementById(id));
        const result = await window.mermaid.render(id, source.textContent, drawing);
        drawing.innerHTML = result.svg;
        const svg = drawing.querySelector('svg');
        if (!svg) throw new Error('SVG が生成されませんでした。');
        const { width, height } = svg.viewBox.baseVal;
        if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('図のサイズを取得できませんでした。');
        svg.style.width = `min(${Math.ceil(width)}px, 100%, calc(var(--diagram-preview-height, min(65vh, 36rem)) * ${width / height}))`;
        svg.style.maxWidth = '100%';
        const tools = document.createElement('div'); tools.className = 'diagram-tools';
        const open = document.createElement('button'); open.type = 'button'; open.className = 'diagram-button diagram-open'; open.textContent = '拡大表示';
        open.setAttribute('aria-haspopup', 'dialog'); open.setAttribute('aria-expanded', 'false');
        open.addEventListener('click', () => { viewer ||= createDiagramViewer(); viewer(drawing, open, width, height); });
        tools.append(open); drawing.before(tools);
        source.hidden = true; status.hidden = true; figure.dataset.result = 'ok';
      } catch (error) {
        drawing.remove(); source.hidden = false;
        status.textContent = `Mermaid 描画エラー: ${error.message || String(error)}`;
        figure.dataset.result = 'error';
      }
    }
  }
  diagrams().finally(() => { document.documentElement.dataset.mdhReady = 'true'; });
})();