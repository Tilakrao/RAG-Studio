class App {
  constructor() {
    this.uploadView = new UploadView();
    this.pipelineView = new PipelineView();
    this.searchView = new SearchView();
    this._currentView = 'upload';
    this._chunkData = { pid: null, page: 0, perPage: 15, all: [], filtered: [] };
    this._init();
  }

  async _init() {
    try { this._bindNav(); } catch (e) { console.error('_bindNav failed', e); }
    try { this._bindSidebar(); } catch (e) { console.error('_bindSidebar failed', e); }
    try { this._bindRefresh(); } catch (e) { console.error('_bindRefresh failed', e); }
    try { this._bindModals(); } catch (e) { console.error('_bindModals failed', e); }
    this._checkServer();

    try {
      await Promise.all([
        this.uploadView.loadDocs(),
        this.pipelineView.loadComponents(),
        this.searchView.loadPipelines(''),
      ]);
    } catch (e) { console.error('Initial data load failed', e); }
    try { this._loadHistory(); } catch (e) { console.error('_loadHistory failed', e); }
    try { this._bindHistory(); } catch (e) { console.error('_bindHistory failed', e); }
  }

  _bindNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.view));
    });
  }

  navigateTo(view) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById('view-' + view);
    if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
    this._currentView = view;
    const labels = { upload: 'Documents', pipeline: 'Pipeline Studio', history: 'Run History', search: 'Search & Evaluate' };
    const bcPage = document.getElementById('bcPage');
    if (bcPage) bcPage.textContent = labels[view] || view;
    if (view === 'history') this._loadHistory();
    if (view === 'search') this.searchView.loadPipelines('');
  }

  _bindSidebar() {
    const tog = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (tog && sidebar) {
      tog.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    }
  }

  _bindRefresh() {
    const btn = document.getElementById('refreshBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (this._currentView === 'upload') this.uploadView.loadDocs();
      else if (this._currentView === 'history') this._loadHistory();
      else if (this._currentView === 'search') this.searchView.loadPipelines('');
    });
  }

  onDocsUpdated(docs) {
    this.pipelineView.updateDocSelect(docs);
    this.searchView.updateDocFilter(docs);
    const hf = document.getElementById('historyDocFilter');
    if (hf) {
      const cur = hf.value;
      hf.innerHTML = '<option value="">All documents</option>' + docs.map(d => `<option value="${d.doc_id}">${d.filename}</option>`).join('');
      if (cur) hf.value = cur;
    }
  }

  onDocSelected(docId) { this.pipelineView.setDoc(docId); }
  onPipelineComplete() { this.searchView.loadPipelines(''); }
  setDocForPipeline(docId) { this.pipelineView.setDoc(docId); }

  // --- HISTORY TAB ---
  _bindHistory() {
    document.getElementById('refreshHistory')?.addEventListener('click', () => this._loadHistory());
    document.getElementById('historyDocFilter')?.addEventListener('change', e => this._loadHistory(e.target.value));
  }

  async _loadHistory(docId) {
    const container = document.getElementById('historyTable');
    container.innerHTML = '<div style="text-align:center;padding:32px"><span class="spinner spinner-lg"></span></div>';
    try {
      const pipelines = await api.listPipelines(docId || '');
      if (!pipelines.length) {
        container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><p>No pipeline runs yet.</p></div>';
        return;
      }
      container.innerHTML = pipelines.map(p => `
        <div class="history-row" id="hr-${p.pipeline_id}">
          <div class="history-row-header" data-hid="${p.pipeline_id}">
            <span class="history-row-summary">${p.config_summary || p.pipeline_id.slice(0, 16)}</span>
            <span class="status-pill status-pill--${p.status}">${p.status}</span>
            <span class="history-row-meta">${p.chunk_count} chunks</span>
            <span class="history-row-meta">${p.duration_seconds != null ? p.duration_seconds.toFixed(1) + 's' : '&mdash;'}</span>
            <button class="btn btn-ghost btn-sm btn-danger" data-hd="${p.pipeline_id}" onclick="event.stopPropagation()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Delete
            </button>
          </div>
          <div class="history-row-detail" id="hd-${p.pipeline_id}"></div>
        </div>
      `).join('');

      container.querySelectorAll('.history-row-header').forEach(hdr => {
        hdr.addEventListener('click', e => {
          if (e.target.closest('[data-hd]')) return;
          const detail = document.getElementById('hd-' + hdr.dataset.hid);
          if (detail.classList.toggle('open')) this._loadHistoryDetail(hdr.dataset.hid, detail);
        });
      });
      container.querySelectorAll('[data-hd]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this pipeline?')) return;
          try { await api.deletePipeline(btn.dataset.hd); this._loadHistory(docId); }
          catch (e) { alert('Delete failed: ' + e.message); }
        });
      });
    } catch (e) {
      container.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
    }
  }

  async _loadHistoryDetail(pid, container) {
    container.innerHTML = '<span class="spinner"></span>';
    try {
      const p = await api.getPipeline(pid);
      const chunks = p.chunks_preview || [];
      container.innerHTML = `
        <div class="detail-actions">
          <button class="btn btn-ghost btn-sm" data-dc="${pid}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>
            View All Chunks
          </button>
          ${p.status === 'completed' || p.status === 'cached' ? `
          <button class="btn btn-ghost btn-sm" data-de="${pid}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            View Embeddings
          </button>` : ''}
        </div>
        <div class="chunk-items">
          ${chunks.map(c => this._chunkHtml(c)).join('') || '<p style="color:var(--text-3);font-size:12px">No chunk preview available.</p>'}
        </div>
      `;
      container.querySelector('[data-dc]')?.addEventListener('click', () => this.openChunkModal(pid, p.config_summary));
      container.querySelector('[data-de]')?.addEventListener('click', () => this.openEmbModal(pid, p.config_summary));
    } catch (e) {
      container.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    }
  }

  _chunkHtml(c) {
    const meta = Object.entries(c.metadata || {}).map(([k, v]) => `<span class="chunk-page-badge">${k}: ${v}</span>`).join('');
    return `
      <div class="chunk-item">
        <div class="chunk-item-header">
          <span class="chunk-idx-badge">#${c.index}</span>
          ${meta}
          <span class="chunk-char-count">${c.content.length} chars</span>
        </div>
        <div class="chunk-content">${this._esc(c.content)}</div>
      </div>
    `;
  }

  _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // --- PDF MODAL ---
  openPdfModal(docId, filename) {
    document.getElementById('pdfModalTitle').textContent = filename || 'Document';
    document.getElementById('pdfFrame').src = api.getDocumentFileUrl(docId);
    document.getElementById('pdfModal').classList.remove('hidden');
  }

  // --- CHUNK MODAL ---
  async openChunkModal(pid, summary) {
    const modal = document.getElementById('chunkModal');
    document.getElementById('chunkModalTitle').textContent = 'Chunks — ' + (summary || pid.slice(0, 12));
    document.getElementById('chunkList').innerHTML = '<div style="text-align:center;padding:32px"><span class="spinner spinner-lg"></span></div>';
    document.getElementById('chunkModalMeta').innerHTML = '';
    document.getElementById('chunkSearch').value = '';
    modal.classList.remove('hidden');
    try {
      const chunks = await api.getPipelineChunks(pid);
      this._chunkData = { pid, page: 0, perPage: 15, all: chunks, filtered: chunks };
      document.getElementById('chunkModalMeta').innerHTML = `
        <span><strong>${chunks.length}</strong> total chunks</span>
        <span>avg ${chunks.length ? Math.round(chunks.reduce((a, c) => a + c.content.length, 0) / chunks.length) : 0} chars/chunk</span>
      `;
      this._renderChunkModal();

      document.getElementById('chunkSearch').oninput = e => {
        const q = e.target.value.toLowerCase();
        this._chunkData.filtered = q ? chunks.filter(c => c.content.toLowerCase().includes(q)) : chunks;
        this._chunkData.page = 0;
        this._renderChunkModal();
      };
    } catch (e) {
      document.getElementById('chunkList').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
    }
  }

  _renderChunkModal() {
    const { page, perPage, filtered } = this._chunkData;
    const total = filtered.length;
    const start = page * perPage;
    const slice = filtered.slice(start, start + perPage);
    document.getElementById('chunkList').innerHTML = slice.length
      ? slice.map(c => this._chunkHtml(c)).join('')
      : '<div class="empty-state" style="padding:32px">No chunks match your search.</div>';
    const totalPages = Math.ceil(total / perPage);
    const pg = document.getElementById('chunkPagination');
    if (totalPages <= 1) { pg.innerHTML = `<span style="font-size:12px;color:var(--text-3)">${total} chunks</span>`; return; }
    let btns = `<span style="font-size:12px;color:var(--text-3);margin-right:8px">${total} chunks</span>`;
    btns += `<button class="page-btn" ${page === 0 ? 'disabled' : ''} onclick="app._chunkPage(${page - 1})">&#8249;</button>`;
    for (let i = 0; i < totalPages; i++) {
      if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) btns += `<button class="page-btn${i === page ? ' active' : ''}" onclick="app._chunkPage(${i})">${i + 1}</button>`;
      else if (Math.abs(i - page) === 2) btns += '<span style="color:var(--text-3)">&hellip;</span>';
    }
    btns += `<button class="page-btn" ${page === totalPages - 1 ? 'disabled' : ''} onclick="app._chunkPage(${page + 1})">&#8250;</button>`;
    pg.innerHTML = btns;
  }

  _chunkPage(p) { this._chunkData.page = p; this._renderChunkModal(); }

  // --- EMBEDDING MODAL ---
  async openEmbModal(pid, summary) {
    const modal = document.getElementById('embModal');
    document.getElementById('embModalTitle').textContent = 'Embeddings — ' + (summary || pid.slice(0, 12));
    document.getElementById('embList').innerHTML = '<div style="text-align:center;padding:32px"><span class="spinner spinner-lg"></span></div>';
    modal.classList.remove('hidden');

    const limitSel = document.getElementById('embLimitSelect');
    const load = async () => {
      document.getElementById('embList').innerHTML = '<div style="text-align:center;padding:32px"><span class="spinner spinner-lg"></span></div>';
      try {
        const embs = await api.getPipelineEmbeddings(pid, parseInt(limitSel.value));
        this._renderEmbModal(embs);
      } catch (e) {
        document.getElementById('embList').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
      }
    };
    limitSel.onchange = load;
    await load();
  }

  _renderEmbModal(embs) {
    const el = document.getElementById('embList');
    if (!embs.length) { el.innerHTML = '<div class="empty-state"><p>No embeddings found.</p></div>'; return; }
    el.innerHTML = embs.map(e => {
      const v = e.vector || [];
      const s = e.stats || {};
      const range = s.max - s.min || 1;
      const displayDims = v.slice(0, 128);
      const cells = displayDims.map((val, i) => {
        const norm = (val - s.min) / range;
        const r = Math.round(norm > 0.5 ? 239 : norm * 2 * 200);
        const b = Math.round(norm < 0.5 ? 239 : (1 - norm) * 2 * 200);
        const g = Math.round(60 + norm * 60);
        const alpha = (0.4 + norm * 0.6).toFixed(2);
        return `<div class="emb-cell" style="background:rgba(${r},${g},${b},${alpha})" title="dim ${i}: ${val.toFixed(4)}"></div>`;
      }).join('');
      return `
        <div class="emb-item">
          <div class="emb-item-header">
            <span class="chunk-idx-badge">#${e.index}</span>
            <span class="emb-item-preview" title="${this._esc(e.content_preview)}">${this._esc(e.content_preview)}</span>
          </div>
          <div class="emb-stats">
            <div class="emb-stat"><div class="emb-stat-value">${s.dim || v.length}</div><div class="emb-stat-label">Dims</div></div>
            <div class="emb-stat"><div class="emb-stat-value">${s.norm?.toFixed(3) || '&mdash;'}</div><div class="emb-stat-label">L2 Norm</div></div>
            <div class="emb-stat"><div class="emb-stat-value">${s.mean?.toFixed(4) || '&mdash;'}</div><div class="emb-stat-label">Mean</div></div>
            <div class="emb-stat"><div class="emb-stat-value">${s.min?.toFixed(3) || '&mdash;'}</div><div class="emb-stat-label">Min</div></div>
            <div class="emb-stat"><div class="emb-stat-value">${s.max?.toFixed(3) || '&mdash;'}</div><div class="emb-stat-label">Max</div></div>
          </div>
          <div style="font-size:10px;color:var(--text-3);margin-bottom:6px">First ${displayDims.length} of ${v.length} dimensions (hover for value)</div>
          <div class="emb-heatmap">${cells}</div>
          <div class="emb-scale">
            <span>${s.min?.toFixed(3)}</span>
            <div class="emb-scale-bar"></div>
            <span>${s.max?.toFixed(3)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- MODALS CLOSE ---
  _bindModals() {
    const close = (id) => document.getElementById(id)?.classList.add('hidden');
    const pdfClose = document.getElementById('pdfModalClose');
    if (pdfClose) pdfClose.onclick = () => { close('pdfModal'); const f = document.getElementById('pdfFrame'); if (f) f.src = ''; };
    document.getElementById('chunkModalClose')?.addEventListener('click', () => close('chunkModal'));
    document.getElementById('embModalClose')?.addEventListener('click', () => close('embModal'));
    ['pdfModal', 'chunkModal', 'embModal'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', e => {
        if (e.target.id === id) { if (id === 'pdfModal') { const f = document.getElementById('pdfFrame'); if (f) f.src = ''; } close(id); }
      });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') ['pdfModal', 'chunkModal', 'embModal'].forEach(id => close(id)); });
  }

  // --- SERVER STATUS ---
  async _checkServer() {
    const dot = document.getElementById('serverDot');
    const txt = document.getElementById('serverStatus');
    try {
      await api.health();
      dot.classList.add('online'); txt.textContent = 'Server online';
    } catch {
      dot.classList.add('offline'); txt.textContent = 'Server offline';
    }
  }
}

const app = new App();
