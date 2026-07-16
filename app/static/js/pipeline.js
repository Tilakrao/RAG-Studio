class PipelineView {
  constructor() {
    this.loaders = []; this.splitters = []; this.embedders = [];
    this.basket = [];
    this._bind();
  }

  async loadComponents() {
    try {
      [this.loaders, this.splitters, this.embedders] = await Promise.all([
        api.getLoaders(), api.getSplitters(), api.getEmbedders()
      ]);
      this._renderSelects();
    } catch (e) { console.error('Components load failed', e); }
  }

  _renderSelects() {
    const ls = document.getElementById('loaderSelect');
    const ss = document.getElementById('splitterSelect');
    const es = document.getElementById('embedderSelect');
    ls.innerHTML = this.loaders.map(l => `<option value="${l.name}">${l.name}</option>`).join('');
    ss.innerHTML = this.splitters.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    es.innerHTML = this.embedders.map(e => `<option value="${e.name}">${e.name}</option>`).join('');
    ls.addEventListener('change', () => this._renderParams('loader'));
    ss.addEventListener('change', () => this._renderParams('splitter'));
    es.addEventListener('change', () => this._renderEmbedderInfo());
    this._renderParams('loader');
    this._renderParams('splitter');
    this._renderEmbedderInfo();
  }

  _renderParams(type) {
    const sel = document.getElementById(type + 'Select');
    const container = document.getElementById(type + 'Params');
    const list = type === 'loader' ? this.loaders : this.splitters;
    const comp = list.find(c => c.name === sel.value);
    if (!comp?.params_schema?.length) { container.innerHTML = ''; return; }
    container.innerHTML = comp.params_schema.map(p => `
      <div class="param-row">
        <label title="${p.description || ''}">${p.name} <span style="color:var(--text-3);font-size:10px">(${p.type})</span></label>
        ${this._paramInput(p)}
      </div>
    `).join('');
  }

  _renderEmbedderInfo() {
    const sel = document.getElementById('embedderSelect');
    const info = document.getElementById('embedderInfo');
    const emb = this.embedders.find(e => e.name === sel.value);
    if (!emb) { info.innerHTML = ''; return; }
    info.innerHTML = `<span class="dim-badge">&#10022; ${emb.dimension}d &middot; ${emb.model_name.split('/').pop()}</span>`;
  }

  _paramInput(p) {
    if (p.type === 'enum' && p.options) {
      return `<select class="field-input" name="${p.name}">${p.options.map(o => `<option value="${o}"${o === p.default ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    }
    const t = (p.type === 'int' || p.type === 'float') ? 'number' : 'text';
    return `<input class="field-input" type="${t}" name="${p.name}" value="${p.default ?? ''}" ${t === 'number' ? 'step="' + (p.type === 'float' ? '0.01' : '1') + '"' : ''}/>`;
  }

  _getParams(type) {
    const params = {};
    document.getElementById(type + 'Params').querySelectorAll('[name]').forEach(el => {
      const schema = this._findParamSchema(type, el.name);
      let v = el.value;
      if (schema?.type === 'int') v = parseInt(v, 10) || 0;
      else if (schema?.type === 'float') v = parseFloat(v) || 0;
      params[el.name] = v;
    });
    return params;
  }

  _findParamSchema(type, name) {
    const sel = document.getElementById(type + 'Select').value;
    const list = type === 'loader' ? this.loaders : this.splitters;
    return list.find(c => c.name === sel)?.params_schema?.find(p => p.name === name);
  }

  _bind() {
    document.getElementById('addToBasketBtn').addEventListener('click', () => this._addToBasket());
    document.getElementById('runAllBtn').addEventListener('click', () => this._runAll());
    document.getElementById('clearBasketBtn').addEventListener('click', () => { this.basket = []; this._renderBasket(); });
  }

  updateDocSelect(docs) {
    const sel = document.getElementById('studioDocSelect');
    const cur = sel.value;
    sel.innerHTML = '<option value="">— select a document —</option>' +
      docs.map(d => `<option value="${d.doc_id}">${d.filename}</option>`).join('');
    if (cur) sel.value = cur;
  }

  setDoc(docId) { document.getElementById('studioDocSelect').value = docId; }

  _addToBasket() {
    if (this.basket.length >= 4) { alert('Basket full (max 4)'); return; }
    const docId = document.getElementById('studioDocSelect').value;
    if (!docId) { alert('Select a document first'); return; }
    const config = {
      loader:   { name: document.getElementById('loaderSelect').value,   params: this._getParams('loader') },
      splitter: { name: document.getElementById('splitterSelect').value, params: this._getParams('splitter') },
      embedder: { name: document.getElementById('embedderSelect').value, params: {} },
    };
    this.basket.push({ docId, config });
    this._renderBasket();
  }

  _renderBasket() {
    const el = document.getElementById('basketList');
    const chip = document.getElementById('basketChip');
    const runBtn = document.getElementById('runAllBtn');
    chip.textContent = `${this.basket.length} / 4`;
    runBtn.disabled = this.basket.length === 0;
    if (!this.basket.length) {
      el.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;color:var(--text-3);font-size:12px">Add configurations using the form</div>';
      return;
    }
    el.innerHTML = this.basket.map((item, i) => `
      <div class="basket-item">
        <div class="basket-item-num">${i + 1}</div>
        <div class="basket-item-label">${item.config.loader.name} &rarr; ${item.config.splitter.name} &rarr; ${item.config.embedder.name}</div>
        <button class="btn btn-ghost btn-sm btn-icon" data-rem="${i}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
    el.querySelectorAll('[data-rem]').forEach(btn => {
      btn.addEventListener('click', () => { this.basket.splice(parseInt(btn.dataset.rem), 1); this._renderBasket(); });
    });
  }

  async _runAll() {
    const docId = document.getElementById('studioDocSelect').value;
    if (!docId) { alert('Select a document'); return; }
    const area = document.getElementById('runResultsArea');
    area.innerHTML = '<div class="alert alert-info"><span class="spinner"></span>&nbsp;Starting pipelines...</div>';
    try {
      const res = await api.runPipelines(docId, this.basket.map(b => b.config));
      area.innerHTML = '';
      res.pipeline_ids.forEach((pid, i) => {
        const item = this.basket[i];
        const card = document.createElement('div');
        card.className = 'run-result-card'; card.id = `rc-${pid}`;
        card.innerHTML = `
          <div class="run-result-header">
            <span class="run-result-summary">${item?.config.loader.name} + ${item?.config.splitter.name} + ${item?.config.embedder.name}</span>
            <span class="status-pill status-pill--pending" id="pill-${pid}"><span class="spinner"></span>&nbsp;pending</span>
          </div>
          <div class="run-result-body" id="rbody-${pid}">Waiting to start...</div>
          <div class="run-result-actions" id="ract-${pid}" style="display:none"></div>
        `;
        area.appendChild(card);
        this._pollPipeline(pid);
      });
      this.basket = []; this._renderBasket();
    } catch (e) {
      area.innerHTML = `<div class="alert alert-error">&#10005; ${e.message}</div>`;
    }
  }

  _pollPipeline(pid) {
    const terminal = new Set(['completed', 'failed', 'cached']);

    const timer = setInterval(async () => {
      try {
        const p    = await api.getPipeline(pid);
        const pill = document.getElementById(`pill-${pid}`);
        const body = document.getElementById(`rbody-${pid}`);
        const acts = document.getElementById(`ract-${pid}`);

        // ── Status pill ──────────────────────────────────────────────
        if (pill) {
          const icons = {
            pending:   '<span class="spinner"></span>&nbsp;',
            running:   '<span class="spinner"></span>&nbsp;',
            completed: '&#10003;&nbsp;',
            cached:    '&#8635;&nbsp;',
            failed:    '&#10005;&nbsp;'
          };
          pill.className = `status-pill status-pill--${p.status}`;
          pill.innerHTML = (icons[p.status] || '') + p.status;
        }

        // ── Step log body — use server-authoritative step_log array ──
        // This ensures all steps are shown regardless of polling interval.
        if (body) {
          const serverLog = Array.isArray(p.step_log) ? p.step_log : [];

          if (p.status === 'pending') {
            body.innerHTML = this._stepHtml([], 'Queued — waiting to start...', p.status);

          } else if (p.status === 'running') {
            body.innerHTML = this._stepHtml(serverLog, serverLog[serverLog.length - 1] || 'Starting...', p.status);

          } else if (p.status === 'completed' || p.status === 'cached') {
            const finalMsg = p.status === 'cached'
              ? `Cached — ${p.chunk_count} chunks already indexed`
              : `Done — ${p.chunk_count} chunks indexed in ${p.duration_seconds?.toFixed(1)}s`;
            const fullLog = serverLog[serverLog.length - 1] === finalMsg
              ? serverLog
              : [...serverLog, finalMsg];
            body.innerHTML = this._stepHtml(fullLog, null, p.status, p);

          } else if (p.status === 'failed') {
            body.innerHTML = this._stepHtml(serverLog, null, p.status) +
              `<div class="step-error">${this._esc(p.error || 'Unknown error')}</div>`;
          }
        }

        // ── Terminal state ───────────────────────────────────────────
        if (terminal.has(p.status)) {
          clearInterval(timer);
          if (acts && (p.status === 'completed' || p.status === 'cached')) {
            acts.style.display = '';
            acts.innerHTML = `
              <button class="btn btn-ghost btn-sm" data-chunks="${pid}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>
                View Chunks (${p.chunk_count})
              </button>
              <button class="btn btn-ghost btn-sm" data-emb="${pid}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                View Embeddings
              </button>
            `;
            acts.querySelector('[data-chunks]').addEventListener('click', () => app.openChunkModal(pid, p.config_summary));
            acts.querySelector('[data-emb]').addEventListener('click', () => app.openEmbModal(pid, p.config_summary));
          }
          app.onPipelineComplete();
        }
      } catch { clearInterval(timer); }
    }, 2000);
  }

  _stepHtml(log, currentStep, status, p = null) {
    const doneIcon  = `<span class="step-icon step-done">&#10003;</span>`;
    const spinIcon  = `<span class="step-icon step-spin"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span></span>`;
    const cacheIcon = `<span class="step-icon step-cache">&#8635;</span>`;

    const lines = log.map((msg, i) => {
      const isLast = i === log.length - 1;
      const icon = status === 'running' && isLast ? spinIcon
                 : status === 'cached'  && isLast ? cacheIcon
                 : doneIcon;
      return `<div class="step-line">${icon}<span class="step-msg">${this._esc(msg)}</span></div>`;
    });

    if (status === 'running' && currentStep && (!log.length || log[log.length-1] !== currentStep)) {
      lines.push(`<div class="step-line">${spinIcon}<span class="step-msg step-current">${this._esc(currentStep)}</span></div>`);
    }

    let summary = '';
    if (p && (status === 'completed' || status === 'cached')) {
      const preview = p.chunks_preview?.[0]?.content?.slice(0, 180) || '';
      summary = preview ? `<div class="step-preview">&ldquo;${this._esc(preview)}&hellip;&rdquo;</div>` : '';
    }

    return `<div class="step-log">${lines.join('')}</div>${summary}`;
  }

  _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
}
