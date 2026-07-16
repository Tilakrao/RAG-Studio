class RagStudioAPI {
  async _fetch(method, path, body, isFormData = false) {
    const opts = { method, headers: {} };
    if (body) {
      if (isFormData) { opts.body = body; }
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch (netErr) {
      // Network-level failure — server not running, port wrong, etc.
      const msg = `Cannot reach server. Is uvicorn running on port 8000?\n(${netErr.message})`;
      if (typeof logger !== 'undefined') logger.error('Network Error', msg);
      throw new Error(msg);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const msg = err.detail || res.statusText;
      if (typeof logger !== 'undefined') logger.error(`HTTP ${res.status} — ${method} ${path}`, msg);
      throw new Error(msg);
    }
    return res.json();
  }

  // Components
  getLoaders()   { return this._fetch('GET', '/api/components/loaders'); }
  getSplitters() { return this._fetch('GET', '/api/components/splitters'); }
  getEmbedders() { return this._fetch('GET', '/api/components/embedders'); }

  // Documents
  uploadDocument(file) {
    const fd = new FormData(); fd.append('file', file);
    return this._fetch('POST', '/api/documents/upload', fd, true);
  }
  listDocuments()           { return this._fetch('GET', '/api/documents'); }
  getDocumentFileUrl(docId) { return `/api/documents/${docId}/file`; }
  deleteDocument(docId)     { return this._fetch('DELETE', `/api/documents/${docId}`); }

  // Pipelines
  runPipelines(docId, configs) { return this._fetch('POST', '/api/pipelines/run', { doc_id: docId, configs }); }
  listPipelines(docId)         { return this._fetch('GET', `/api/pipelines${docId ? `?doc_id=${docId}` : ''}`); }
  getPipeline(id)              { return this._fetch('GET', `/api/pipelines/${id}`); }
  getPipelineChunks(id)        { return this._fetch('GET', `/api/pipelines/${id}/chunks`); }
  getPipelineEmbeddings(id, limit = 20) { return this._fetch('GET', `/api/pipelines/${id}/embeddings?limit=${limit}`); }
  deletePipeline(id)           { return this._fetch('DELETE', `/api/pipelines/${id}`); }

  // Search
  getSearchTypes() { return this._fetch('GET', '/api/search/types'); }
  getRerankers()   { return this._fetch('GET', '/api/search/rerankers'); }
  queryPipeline(pipelineId, query, k = 5, searchType = 'cosine', reranker = 'none') {
    return this._fetch('POST', '/api/search/query', { pipeline_ids: [pipelineId], query, k, search_type: searchType, reranker });
  }
  comparePipelines(ids, query, k = 5, searchType = 'cosine', reranker = 'none') {
    return this._fetch('POST', '/api/search/compare', { pipeline_ids: ids, query, k, search_type: searchType, reranker });
  }
  strategyCompare(pipelineId, query, k = 5, searchTypes, reranker = 'none') {
    return this._fetch('POST', '/api/search/strategy_compare', { pipeline_id: pipelineId, query, k, search_types: searchTypes, reranker });
  }

  // Logs
  getLogs(lines = 200, level = 'ALL') {
    return this._fetch('GET', `/api/logs/json?lines=${lines}&level=${level}`);
  }

  // Health
  health() { return this._fetch('GET', '/health'); }
}

const api = new RagStudioAPI();
