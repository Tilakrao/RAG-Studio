class SearchView {
  constructor() {
    this.pipelines       = [];
    this.selectedIds     = new Set();
    this.strategyPipelineId = null;
    this.selectedStrategies = new Set(["cosine", "bm25", "cosine+bm25"]);
    this.mode            = "pipelines";
    this._allStrategies  = [];
    // Pin state
    this.pinnedColumns   = [];   // frozen columns from previous searches
    this.currentColumns  = [];   // columns from the most recent search
    this.lastQuery       = "";
    this._bind();
    this._loadStrategies();
    this._loadRerankers();
  }

  async _loadStrategies() {
    try {
      this._allStrategies = await api.getSearchTypes();
      this._renderStrategyChecklist();
    } catch (e) { console.error("Could not load search types", e); }
  }

  async _loadRerankers() {
    try {
      const rerankers = await api.getRerankers();
      const sel = document.getElementById("rerankerSelect");
      sel.innerHTML = rerankers.map(r =>
        `<option value="${r.id}" title="${r.description || ""}">${r.label}</option>`
      ).join("");
    } catch (e) { console.error("Could not load rerankers", e); }
  }

  async loadPipelines(docId) {
    try {
      const all = await api.listPipelines(docId || "");
      this.pipelines = all.filter(p => ["completed","cached"].includes(p.status));
      this._renderChecklist();
      this._renderStrategyPipelineList();
      const badge = document.getElementById("runCountBadge");
      badge.textContent = this.pipelines.length;
      badge.style.display = this.pipelines.length ? "" : "none";
    } catch (e) { console.error(e); }
  }

  updateDocFilter(docs) {
    const sel = document.getElementById("searchDocFilter");
    const cur = sel.value;
    sel.innerHTML = "<option value=\"\">All documents</option>" +
      docs.map(d => `<option value="${d.doc_id}">${d.filename}</option>`).join("");
    if (cur) sel.value = cur;
  }

  _bind() {
    document.getElementById("searchDocFilter").addEventListener("change", e => {
      this.selectedIds.clear();
      this.strategyPipelineId = null;
      this.loadPipelines(e.target.value);
    });
    document.getElementById("searchBtn").addEventListener("click", () => this._search());
    document.getElementById("queryInput").addEventListener("keydown", e => { if (e.key === "Enter") this._search(); });
    document.getElementById("searchModeToggle").addEventListener("click", e => {
      const btn = e.target.closest(".mode-btn");
      if (!btn) return;
      this.mode = btn.dataset.mode;
      document.querySelectorAll("#searchModeToggle .mode-btn").forEach(b => b.classList.toggle("active", b === btn));
      document.getElementById("pipelinesPanel").classList.toggle("hidden", this.mode !== "pipelines");
      document.getElementById("strategiesPanel").classList.toggle("hidden", this.mode !== "strategies");
      document.getElementById("searchTypeWrap").classList.toggle("hidden", this.mode !== "pipelines");
    });
  }

  // ── Sidebar checklists ─────────────────────────────────────────────────────

  _renderChecklist() {
    const el = document.getElementById("pipelineChecklist");
    const chip = document.getElementById("selectedPipelineChip");
    chip.textContent = `${this.selectedIds.size} selected`;
    if (!this.pipelines.length) {
      el.innerHTML = "<div style=\"padding:16px;font-size:12px;color:var(--text-3);text-align:center\">No completed pipelines</div>";
      return;
    }
    el.innerHTML = this.pipelines.map(p => `
      <div class="checklist-item${this.selectedIds.has(p.pipeline_id) ? " checked" : ""}" data-pid="${p.pipeline_id}">
        <div class="checklist-cb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="checklist-label">${p.config_summary || p.pipeline_id.slice(0,12)}<br/><span style="color:var(--text-3);font-size:10px">${p.chunk_count} chunks &middot; ${p.status}</span></div>
      </div>
    `).join("");
    el.querySelectorAll(".checklist-item").forEach(item => {
      item.addEventListener("click", () => {
        const pid = item.dataset.pid;
        if (this.selectedIds.has(pid)) this.selectedIds.delete(pid);
        else { if (this.selectedIds.size >= 4) { alert("Max 4 pipelines"); return; } this.selectedIds.add(pid); }
        this._renderChecklist();
      });
    });
  }

  _renderStrategyPipelineList() {
    const el = document.getElementById("strategyPipelineList");
    if (!this.pipelines.length) {
      el.innerHTML = "<div style=\"padding:16px;font-size:12px;color:var(--text-3);text-align:center\">No completed pipelines</div>";
      return;
    }
    el.innerHTML = this.pipelines.map(p => `
      <div class="checklist-item${this.strategyPipelineId === p.pipeline_id ? " checked" : ""}" data-spid="${p.pipeline_id}">
        <div class="checklist-cb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="checklist-label">${p.config_summary || p.pipeline_id.slice(0,12)}<br/><span style="color:var(--text-3);font-size:10px">${p.chunk_count} chunks</span></div>
      </div>
    `).join("");
    el.querySelectorAll("[data-spid]").forEach(item => {
      item.addEventListener("click", () => {
        this.strategyPipelineId = item.dataset.spid;
        this._renderStrategyPipelineList();
      });
    });
  }

  _renderStrategyChecklist() {
    const el = document.getElementById("strategyChecklist");
    if (!this._allStrategies.length) { el.innerHTML = "<div style=\"font-size:12px;color:var(--text-3)\">Loading...</div>"; return; }
    el.innerHTML = this._allStrategies.map(s => `
      <div class="strategy-item${this.selectedStrategies.has(s.id) ? " checked" : ""}" data-sid="${s.id}">
        <div class="checklist-cb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="strategy-label">
          <span class="strategy-name">${s.label}</span>
          ${this._strategyBadge(s.id)}
        </div>
      </div>
    `).join("");
    el.querySelectorAll(".strategy-item").forEach(item => {
      item.addEventListener("click", () => {
        const sid = item.dataset.sid;
        if (this.selectedStrategies.has(sid)) { if (this.selectedStrategies.size > 1) this.selectedStrategies.delete(sid); }
        else { if (this.selectedStrategies.size >= 5) { alert("Max 5 strategies"); return; } this.selectedStrategies.add(sid); }
        this._renderStrategyChecklist();
      });
    });
  }

  _strategyBadge(id) {
    if (id.includes("+bm25")) return "<span class=\"strat-tag strat-tag--hybrid\">hybrid</span>";
    if (id === "bm25") return "<span class=\"strat-tag strat-tag--sparse\">sparse</span>";
    return "<span class=\"strat-tag strat-tag--dense\">dense</span>";
  }

  _reranker() { return document.getElementById("rerankerSelect")?.value || "none"; }

  // ── Search ─────────────────────────────────────────────────────────────────

  async _search() {
    const query = document.getElementById("queryInput").value.trim();
    if (!query) { alert("Enter a query"); return; }
    const k = parseInt(document.getElementById("kInput").value, 10) || 5;
    const reranker = this._reranker();
    const grid = document.getElementById("compareGrid");
    const evalPanel = document.getElementById("evalPanel");
    this.lastQuery = query;
    grid.innerHTML = "<div style=\"text-align:center;padding:40px;color:var(--text-2)\"><span class=\"spinner spinner-lg\"></span><p style=\"margin-top:12px\">Searching…</p></div>";
    evalPanel.classList.add("hidden");

    try {
      if (this.mode === "strategies") {
        if (!this.strategyPipelineId) { alert("Select a pipeline in the Strategies panel"); return; }
        if (!this.selectedStrategies.size) { alert("Select at least one strategy"); return; }
        const res = await api.strategyCompare(this.strategyPipelineId, query, k, [...this.selectedStrategies], reranker);
        this._extractStrategyColumns(res);
        this._renderStrategyEvalPanel(res);
      } else {
        if (!this.selectedIds.size) { alert("Select at least one pipeline"); return; }
        const searchType = document.getElementById("searchTypeSelect").value;
        const res = await api.comparePipelines([...this.selectedIds], query, k, searchType, reranker);
        this._extractPipelineColumns(res);
        this._renderEvalPanel(res);
      }
    } catch (e) {
      this.currentColumns = [];
      grid.innerHTML = `<div class="alert alert-error">&#10005; ${e.message}</div>`;
    }
  }

  // ── Extract columns from API response ──────────────────────────────────────

  _extractPipelineColumns(res) {
    this.currentColumns = (res.pipelines || []).map(p => ({
      label:       p.config_summary || p.pipeline_id.slice(0,16),
      query:       this.lastQuery,
      search_type: p.search_type || res.search_type || "cosine",
      reranker:    p.reranker || "none",
      timing:      p.timing,
      results:     p.results || [],
      error:       p.error || null,
    }));
    this._renderGrid();
  }

  _extractStrategyColumns(res) {
    this.currentColumns = (res.strategies || []).map(s => ({
      label:       s.label,
      subLabel:    res.config_summary || null,
      query:       this.lastQuery,
      search_type: s.search_type,
      reranker:    s.reranker || res.reranker || "none",
      timing:      s.timing,
      results:     s.results || [],
      error:       s.error || null,
    }));
    this._renderGrid();
  }

  // ── Pin / Unpin ────────────────────────────────────────────────────────────

  _pinColumn(curIdx) {
    if (this.pinnedColumns.length >= 3) { alert("Max 3 columns can be pinned at once"); return; }
    const col = this.currentColumns[curIdx];
    if (!col) return;
    this.pinnedColumns.push({ ...col, pinnedAt: new Date().toLocaleTimeString() });
    this._renderGrid();
  }

  _unpinColumn(pinIdx) {
    this.pinnedColumns.splice(pinIdx, 1);
    this._renderGrid();
  }

  _clearAllPins() {
    this.pinnedColumns = [];
    this._renderGrid();
  }

  // ── Grid renderer ──────────────────────────────────────────────────────────

  _renderGrid() {
    const grid = document.getElementById("compareGrid");
    const bar  = document.getElementById("pinnedBar");
    const hasPinned  = this.pinnedColumns.length > 0;
    const hasCurrent = this.currentColumns.length > 0;

    // Pinned bar (shows count + clear button)
    if (hasPinned) {
      bar.classList.remove("hidden");
      bar.innerHTML = `
        <span class="pinned-bar-icon">&#128204;</span>
        <span class="pinned-bar-label">${this.pinnedColumns.length} column${this.pinnedColumns.length>1?"s":""} pinned</span>
        <span class="pinned-bar-hint">Search again to compare side-by-side &rarr;</span>
        <button class="btn btn-ghost btn-sm pinned-bar-clear" id="clearPinsBtn">Clear all pins</button>
      `;
      document.getElementById("clearPinsBtn").addEventListener("click", () => this._clearAllPins());
    } else {
      bar.classList.add("hidden");
    }

    if (!hasPinned && !hasCurrent) { grid.innerHTML = ""; grid.style.gridTemplateColumns = ""; return; }

    // Build parts: pinned cols | divider | current cols
    const parts = [];
    this.pinnedColumns.forEach((col, i) => parts.push({ col, isPinned: true, idx: i }));
    if (hasPinned && hasCurrent) parts.push({ isDivider: true });
    this.currentColumns.forEach((col, i) => parts.push({ col, isPinned: false, idx: i }));

    // Grid template
    grid.style.gridTemplateColumns = parts
      .map(p => p.isDivider ? "28px" : "minmax(0,1fr)")
      .join(" ");

    grid.innerHTML = parts.map(p =>
      p.isDivider ? this._dividerHtml() : this._colHtml(p.col, p.isPinned, p.idx)
    ).join("");

    // Event delegation for pin / unpin
    grid.querySelectorAll("[data-pin-cur]").forEach(btn =>
      btn.addEventListener("click", () => this._pinColumn(parseInt(btn.dataset.pinCur)))
    );
    grid.querySelectorAll("[data-unpin]").forEach(btn =>
      btn.addEventListener("click", () => this._unpinColumn(parseInt(btn.dataset.unpin)))
    );
  }

  _dividerHtml() {
    return `
      <div class="pin-col-divider">
        <div class="pin-col-divider-line"></div>
        <div class="pin-col-divider-label">VS</div>
        <div class="pin-col-divider-line"></div>
      </div>
    `;
  }

  _colHtml(col, isPinned, idx) {
    const results = col.results || [];

    const pinBtn = isPinned
      ? `<button class="unpin-btn" data-unpin="${idx}" title="Unpin this column">&#10005;</button>`
      : `<button class="pin-btn" data-pin-cur="${idx}" title="Pin to compare later">&#128204;</button>`;

    const pinnedAtHtml = col.pinnedAt
      ? `<div class="col-pinned-at">&#128204; pinned at ${col.pinnedAt}</div>`
      : "";

    const rerankerTag = col.reranker && col.reranker !== "none"
      ? `<span class="col-params-tag col-params-tag--reranker">${this._esc(col.reranker)}</span>`
      : "";

    return `
      <div class="compare-col${isPinned ? " compare-col--pinned" : ""}">
        <div class="compare-col-header">
          <div class="col-header-main">
            <span class="col-header-title" title="${this._esc(col.label)}">${this._esc(col.label)}</span>
            ${col.subLabel ? `<span class="col-sub-label">${this._esc(col.subLabel)}</span>` : ""}
            ${pinnedAtHtml}
          </div>
          ${pinBtn}
        </div>
        <div class="col-params-strip">
          <span class="col-params-query" title="${this._esc(col.query || "")}">&ldquo;${this._esc((col.query||"").slice(0,36))}${(col.query||"").length>36?"&hellip;":""}&rdquo;</span>
          <span class="col-params-sep">&middot;</span>
          <span class="col-params-tag">${this._esc(col.search_type||"cosine")}</span>
          ${rerankerTag}
        </div>
        ${this._timingBar(col.timing, col.reranker)}
        ${col.error ? `<div class="alert alert-error">${col.error}</div>` : ""}
        ${results.map((r,i) => this._resultCard(r,i)).join("")}
        ${!results.length && !col.error ? "<div class=\"empty-state\" style=\"padding:20px\">No results</div>" : ""}
      </div>
    `;
  }

  // ── Timing bar ─────────────────────────────────────────────────────────────

  _timingBar(timing, reranker) {
    if (!timing) return "";
    const { retrieval_ms=0, reranking_ms=0, total_ms=0 } = timing;
    const hasReranker = reranker && reranker !== "none";
    const rerankDetail = hasReranker ? ` &middot; rerank: <strong>${reranking_ms}ms</strong>` : "";
    const rerankBadge  = hasReranker ? `<span class="timing-reranker-badge">${this._esc(reranker)}</span>` : "";
    return `
      <div class="timing-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>retrieve: <strong>${retrieval_ms}ms</strong>${rerankDetail} &middot; total: <strong>${total_ms}ms</strong></span>
        ${rerankBadge}
      </div>
    `;
  }

  // ── Result card ────────────────────────────────────────────────────────────

  _resultCard(r, i) {
    const pct = Math.max(0, Math.min(100, (r.score||0)*100));
    const circumference = 2*Math.PI*14;
    const dash = (pct/100)*circumference;
    const color = pct>70?"var(--success)":pct>40?"var(--warning)":"var(--danger)";
    const rankClass = i===0?"rank-1":i===1?"rank-2":i===2?"rank-3":"";
    const metaTags = Object.entries(r.metadata||{}).map(([k,v])=>`<span class="result-meta-tag">${k}: ${v}</span>`).join("");
    const content = this._esc(r.chunk);
    const uid = `rc-${i}-${Math.random().toString(36).slice(2,6)}`;

    const origRank = r.original_rank;
    const newRank  = r.rank;
    let rankChangeBadge = "";
    if (origRank != null && origRank !== newRank) {
      const delta = origRank - newRank;
      rankChangeBadge = delta > 0
        ? `<span class="rank-change rank-up" title="Was #${origRank}">&#8593;${delta}</span>`
        : `<span class="rank-change rank-down" title="Was #${origRank}">&#8595;${Math.abs(delta)}</span>`;
    }

    const hybridDetail = r.score_type==="hybrid_rrf"
      ? `<div class="hybrid-subscores">dense: ${((r.dense_score||0)*100).toFixed(0)}% &middot; bm25: ${((r.bm25_score||0)*100).toFixed(0)}%</div>`
      : "";

    return `
      <div class="result-card">
        <div class="result-card-header">
          <div class="result-rank-badge ${rankClass}">${newRank}${rankChangeBadge}</div>
          <div style="flex:1;padding:0 8px;font-size:11px;color:var(--text-2)">${r.chunk.length} chars${hybridDetail}</div>
          <div class="score-ring-wrap" title="Score: ${(r.score||0).toFixed(4)} (${r.score_type||"cosine"})">
            <svg class="score-ring" viewBox="0 0 36 36">
              <circle class="score-ring-bg" cx="18" cy="18" r="14"/>
              <circle class="score-ring-fill" cx="18" cy="18" r="14"
                stroke="${color}"
                stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
                stroke-dashoffset="${(circumference*0.25).toFixed(2)}"
              />
              <text x="18" y="18" class="score-ring-text" fill="var(--text)" font-size="6" text-anchor="middle" dominant-baseline="middle" transform="rotate(90,18,18)">${pct.toFixed(0)}%</text>
            </svg>
          </div>
        </div>
        <div class="result-text" id="${uid}">${content}</div>
        ${content.length>500?`<button class="btn btn-ghost btn-sm" style="margin-bottom:8px" onclick="this.previousElementSibling.classList.toggle('expanded');this.textContent=this.previousElementSibling.classList.contains('expanded')?'Show less':'Show more'">Show more</button>`:""}
        ${metaTags?`<div class="result-meta">${metaTags}</div>`:""}
      </div>
    `;
  }

  // ── Eval panels ────────────────────────────────────────────────────────────

  _renderEvalPanel(res) {
    const panel = document.getElementById("evalPanel");
    panel.classList.remove("hidden");
    const cols = (res.pipelines||[]).filter(p => p.results?.length);
    if (!cols.length) { panel.innerHTML = ""; return; }
    const metrics = cols.map(p => this._colMetrics(p.results, p.config_summary||p.pipeline_id.slice(0,12)));
    this._renderEvalHtml(panel, metrics, cols.flatMap(p=>p.results.map(r=>r.score)), "Pipeline Ranking by Mean Score");
  }

  _renderStrategyEvalPanel(res) {
    const panel = document.getElementById("evalPanel");
    panel.classList.remove("hidden");
    const cols = (res.strategies||[]).filter(s => s.results?.length);
    if (!cols.length) { panel.innerHTML = ""; return; }
    const metrics = cols.map(s => this._colMetrics(s.results, s.label));
    this._renderEvalHtml(panel, metrics, cols.flatMap(s=>s.results.map(r=>r.score)), "Strategy Ranking by Mean Score");
  }

  _colMetrics(results, name) {
    const scores = results.map(r => r.score);
    const mean = scores.reduce((a,b)=>a+b,0)/scores.length;
    const variance = scores.reduce((a,b)=>a+(b-mean)**2,0)/scores.length;
    return { name, scores, mean, std:Math.sqrt(variance), ndcg:this._ndcg(scores), sources:new Set(results.map(r=>r.metadata?.page||r.metadata?.source||"?")).size };
  }

  _renderEvalHtml(panel, metrics, allScores, rankTitle) {
    const globalMean = allScores.reduce((a,b)=>a+b,0)/allScores.length;
    const topScore = Math.max(...allScores);
    const buckets = Array(10).fill(0);
    allScores.forEach(s=>{const b=Math.min(9,Math.floor(s*10));buckets[b]++;});
    const maxBucket = Math.max(...buckets,1);
    const bestItem  = metrics.reduce((a,b)=>b.mean>a.mean?b:a);
    const maxMean   = Math.max(...metrics.map(m=>m.mean));

    panel.innerHTML = `
      <div class="eval-panel-title">Evaluation Metrics</div>
      <div class="eval-grid">
        <div class="eval-metric highlight"><div class="eval-metric-value">${(globalMean*100).toFixed(1)}%</div><div class="eval-metric-label">Mean Score</div></div>
        <div class="eval-metric"><div class="eval-metric-value">${(topScore*100).toFixed(1)}%</div><div class="eval-metric-label">Top Score</div></div>
        <div class="eval-metric"><div class="eval-metric-value">${allScores.length}</div><div class="eval-metric-label">Total Results</div></div>
        <div class="eval-metric"><div class="eval-metric-value">${metrics.length}</div><div class="eval-metric-label">Compared</div></div>
      </div>
      <div class="eval-histogram">
        <div class="eval-histogram-title">Score Distribution</div>
        <div class="histogram-bars">
          ${buckets.map((c,i)=>`<div class="histo-bar" style="height:${(c/maxBucket*100).toFixed(0)}%;opacity:${(0.4+0.6*(i/9)).toFixed(2)}" title="${i*10}-${(i+1)*10}%: ${c}"></div>`).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-3);margin-top:4px"><span>0%</span><span>50%</span><span>100%</span></div>
      </div>
      ${metrics.length>1?`
        <div class="eval-pipeline-comparison">
          <div class="eval-comparison-title">${rankTitle}</div>
          ${[...metrics].sort((a,b)=>b.mean-a.mean).map((m,i)=>`
            <div class="eval-comparison-row">
              <div class="eval-comparison-name" title="${m.name}">${i===0?"&#127945; ":""}${m.name}</div>
              <div class="eval-comparison-bar-wrap"><div class="eval-comparison-bar" style="width:${(m.mean/maxMean*100).toFixed(0)}%"></div></div>
              <div class="eval-comparison-score">${(m.mean*100).toFixed(1)}%</div>
            </div>
          `).join("")}
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-2)">
          Best: <strong style="color:var(--text)">${bestItem.name}</strong>
          &middot; nDCG@k: <strong>${bestItem.ndcg.toFixed(3)}</strong>
          &middot; Std: <strong>${(bestItem.std*100).toFixed(1)}%</strong>
          &middot; Coverage: <strong>${bestItem.sources} page(s)</strong>
        </div>
      `:`
        <div style="margin-top:12px;font-size:12px;color:var(--text-2)">
          nDCG@k: <strong>${metrics[0]?.ndcg.toFixed(3)||"&mdash;"}</strong>
          &middot; Std: <strong>${((metrics[0]?.std||0)*100).toFixed(1)}%</strong>
          &middot; Coverage: <strong>${metrics[0]?.sources||0} page(s)</strong>
        </div>
      `}
    `;
  }

  _ndcg(scores) {
    if (!scores.length) return 0;
    const dcg   = scores.reduce((acc,s,i)=>acc+s/Math.log2(i+2),0);
    const ideal = [...scores].sort((a,b)=>b-a).reduce((acc,s,i)=>acc+s/Math.log2(i+2),0);
    return ideal>0?dcg/ideal:0;
  }

  _esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
}
