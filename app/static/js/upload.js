class UploadView {
  constructor() {
    this.docs = [];
    this.selectedDocId = null;
    this._bind();
  }

  _bind() {
    const zone = document.getElementById('dropZone');
    const input = document.getElementById('fileInput');

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) this._upload(f);
    });
    zone.addEventListener('click', e => { if (e.target.tagName !== 'LABEL') input.click(); });
    const browseLabel = document.querySelector('label[for="fileInput"]');
    if (browseLabel) browseLabel.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('change', () => { if (input.files[0]) this._upload(input.files[0]); });
    const refreshDocs = document.getElementById('refreshDocs');
    if (refreshDocs) refreshDocs.addEventListener('click', () => this.loadDocs());
  }

  async _upload(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      logger.warn('Invalid File', 'Only PDF files are supported');
      return;
    }
    const fb = document.getElementById('uploadFeedback');
    fb.innerHTML = '<div class="alert alert-info"><span class="spinner"></span>&nbsp;Uploading <strong>' + file.name + '</strong>...</div>';
    logger.info('Upload started', file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)');
    try {
      const doc = await api.uploadDocument(file);
      fb.innerHTML = '<div class="alert alert-success">&#10003; Upload successful!</div>';
      logger.success('Upload complete', file.name + ' — doc_id: ' + doc.doc_id);
      await this.loadDocs();
      setTimeout(() => { fb.innerHTML = ''; }, 3000);
    } catch (e) {
      fb.innerHTML = `<div class="alert alert-error">&#10005; ${e.message}</div>`;
      // logger.error already called inside api._fetch
    }
  }

  async loadDocs() {
    try {
      this.docs = await api.listDocuments();
      this._render();
      app.onDocsUpdated(this.docs);
      const badge = document.getElementById('docCountBadge');
      badge.textContent = this.docs.length;
      badge.style.display = this.docs.length ? '' : 'none';
    } catch (e) { console.error(e); }
  }

  _render() {
    const el = document.getElementById('docGrid');
    if (!this.docs.length) {
      el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>No documents yet. Upload a PDF above.</p></div>`;
      return;
    }
    el.innerHTML = this.docs.map(d => `
      <div class="doc-card${d.doc_id === this.selectedDocId ? ' selected' : ''}" data-id="${d.doc_id}">
        <div class="doc-card-header">
          <div class="doc-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <div class="doc-name" title="${d.filename}">${d.filename}</div>
        </div>
        <div class="doc-meta">
          <span class="doc-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            ${this._fmt(d.size_bytes)}
          </span>
          <span class="doc-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${this._date(d.upload_time)}
          </span>
        </div>
        <div class="doc-actions">
          <button class="btn btn-ghost btn-sm" data-action="view-pdf" data-id="${d.doc_id}" data-name="${d.filename}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            View PDF
          </button>
          <button class="btn btn-ghost btn-sm" data-action="configure" data-id="${d.doc_id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20 12h2M2 12h2M17.66 18.66l1.41 1.41M6.34 5.34 4.93 4.93"/></svg>
            Configure
          </button>
          <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${d.doc_id}" style="margin-left:auto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            Delete
          </button>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { action, id, name } = btn.dataset;
        if (action === 'view-pdf') app.openPdfModal(id, name);
        else if (action === 'configure') {
          this.selectedDocId = id;
          this._render();
          app.navigateTo('pipeline');
          app.setDocForPipeline(id);
        }
        else if (action === 'delete') this._delete(id);
      });
    });
    el.querySelectorAll('.doc-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-action]')) return;
        this.selectedDocId = card.dataset.id;
        this._render();
        app.onDocSelected(card.dataset.id);
      });
    });
  }

  async _delete(docId) {
    if (!confirm('Delete this document and all its pipelines?')) return;
    try {
      await api.deleteDocument(docId);
      if (this.selectedDocId === docId) this.selectedDocId = null;
      await this.loadDocs();
    } catch (e) { alert('Delete failed: ' + e.message); }
  }

  _fmt(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  _date(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
