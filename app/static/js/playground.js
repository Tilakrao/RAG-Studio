/* ===================================================================
   EMBEDDING PLAYGROUND
   ================================================================= */

const MODEL_COLORS = {
  all_mpnet_base_v2: { hex: '#0F766E', rgb: '15,118,110',  shape: 'circle'   },
  all_minilm_l6_v2:  { hex: '#F97316', rgb: '249,115,22',  shape: 'triangle' },
  all_minilm_l12_v2: { hex: '#DC2626', rgb: '220,38,38',   shape: 'diamond'  },
  multi_qa_mpnet:    { hex: '#D97706', rgb: '217,119,6',   shape: 'star'     },
  bge_small_en:      { hex: '#059669', rgb: '5,150,105',   shape: 'square'   },
  bge_base_en:       { hex: '#F43F5E', rgb: '244,63,94',   shape: 'hexagon'  },
};
const MODEL_COLOR_FALLBACK = { hex: '#94A3B8', rgb: '148,163,184', shape: 'circle' };

function modelShapeSVG(col, size = 14) {
  const shapes = {
    circle:   `<circle cx="7" cy="7" r="5.5"/>`,
    triangle: `<polygon points="7,1.5 13,12.5 1,12.5"/>`,
    diamond:  `<polygon points="7,1 13,7 7,13 1,7"/>`,
    star:     `<polygon points="7,1.5 8.6,5.6 13.5,5.6 9.6,8.5 11,13 7,10 3,13 4.4,8.5 0.5,5.6 5.4,5.6"/>`,
    square:   `<rect x="1.5" y="1.5" width="11" height="11" rx="2.5"/>`,
    hexagon:  `<polygon points="7,1 12.5,4 12.5,10 7,13 1.5,10 1.5,4"/>`,
  };
  const path = shapes[col.shape] || shapes.circle;
  return `<svg class="pg-model-shape" viewBox="0 0 14 14" fill="${col.hex}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;display:block">${path}</svg>`;
}

// Short labels shown INSIDE the canvas next to query stars
const MODEL_SHORT = {
  all_minilm_l6_v2:  'L6',
  all_minilm_l12_v2: 'L12',
  all_mpnet_base_v2: 'MPNet',
  multi_qa_mpnet:    'Q-MP',
  bge_small_en:      'BGE-S',
  bge_base_en:       'BGE-B',
};


// ── Canvas scatter-plot renderer ──────────────────────────────────
class EmbScatter {
  constructor(canvas, points) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.points   = points;
    this._pad     = { top: 40, right: 28, bottom: 52, left: 60 };
    this._tip     = null;
    this._scale   = 1;
    this._panX    = 0;
    this._panY    = 0;
    this._dragging   = false;
    this._dragOrigin = null;
    this._hoverIdx   = null;   // text_index currently under cursor
    this._prevHover  = null;   // to detect change

    // bind handlers
    this._onMove  = this._handleMove.bind(this);
    this._onLeave = this._handleLeave.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onDown  = this._handleDown.bind(this);
    this._onUp    = this._handleUp.bind(this);
    this._onDbl   = this._handleDbl.bind(this);

    this._render();
    this._bindEvents();
  }

  destroy() {
    this.canvas.removeEventListener('mousemove',  this._onMove);
    this.canvas.removeEventListener('mouseleave', this._onLeave);
    this.canvas.removeEventListener('wheel',      this._onWheel);
    this.canvas.removeEventListener('mousedown',  this._onDown);
    this.canvas.removeEventListener('mouseup',    this._onUp);
    this.canvas.removeEventListener('dblclick',   this._onDbl);
    if (this._tip) this._tip.remove();
    this._tip = null;
  }

  // ── Render ──────────────────────────────────────────────────────

  _render() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = rect.width;
    this.H = rect.height;

    const pts = this.points;
    const { top: pt, right: pr, bottom: pb, left: pl } = this._pad;
    const plotW = this.W - pl - pr;
    const plotH = this.H - pt - pb;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0, 0, this.W, this.H);

    if (!pts.length) return;

    // Compute data bounds
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    let [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
    let [yMin, yMax] = [Math.min(...ys), Math.max(...ys)];
    const xPad = (xMax - xMin) * 0.12 || 0.5;
    const yPad = (yMax - yMin) * 0.12 || 0.5;
    xMin -= xPad; xMax += xPad;
    yMin -= yPad; yMax += yPad;
    this._xMin = xMin; this._xMax = xMax;
    this._yMin = yMin; this._yMax = yMax;

    // Zoom + pan coordinate mapping (origin = plot centre)
    const plotCX = pl + plotW / 2;
    const plotCY = pt + plotH / 2;
    this._plotCX = plotCX; this._plotCY = plotCY;
    this._pl = pl; this._pt = pt; this._plotW = plotW; this._plotH = plotH;

    this._toX = v => {
      const base = pl + ((v - xMin) / (xMax - xMin)) * plotW;
      return plotCX + (base - plotCX) * this._scale + this._panX;
    };
    this._toY = v => {
      const base = pt + ((yMax - v) / (yMax - yMin)) * plotH;
      return plotCY + (base - plotCY) * this._scale + this._panY;
    };

    // Plot area background
    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    ctx.fillRect(pl, pt, plotW, plotH);

    // Grid (fixed, not affected by pan/zoom)
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const x = pl + (i / 5) * plotW;
      const y = pt + (i / 5) * plotH;
      ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pl + plotW, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pl, pt + plotH); ctx.lineTo(pl + plotW, pt + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pl, pt); ctx.lineTo(pl, pt + plotH); ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#64748B';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PC1 →', pl + plotW / 2, this.H - 12);
    ctx.save();
    ctx.translate(14, pt + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('PC2 →', 0, 0);
    ctx.restore();

    // Zoom hint (top-right of plot area)
    if (this._scale !== 1 || this._panX !== 0 || this._panY !== 0) {
      ctx.fillStyle = 'rgba(100,116,139,0.7)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${this._scale.toFixed(1)}× · dbl-click to reset`, pl + plotW - 6, pt + 14);
    }

    // Clip all data-drawing to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pl, pt, plotW, plotH);
    ctx.clip();

    const hasQuery = pts.some(p => p.type === 'query');

    // ── Connecting lines between same text across models ──────────
    const textGroups = {};
    for (const p of pts) {
      if (p.type === 'user_text' && p.text_index != null) {
        if (!textGroups[p.text_index]) textGroups[p.text_index] = [];
        textGroups[p.text_index].push(p);
      }
    }

    // Dim base lines
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1;
    for (const [idx, group] of Object.entries(textGroups)) {
      if (group.length < 2) continue;
      const isHovered = this._hoverIdx != null && parseInt(idx) === this._hoverIdx;
      ctx.strokeStyle = isHovered ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth   = isHovered ? 2 : 1;
      for (let i = 0; i < group.length - 1; i++) {
        for (let j = i + 1; j < group.length; j++) {
          ctx.beginPath();
          ctx.moveTo(this._toX(group[i].x), this._toY(group[i].y));
          ctx.lineTo(this._toX(group[j].x), this._toY(group[j].y));
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);

    // ── Points: chunks → texts → query ───────────────────────────
    const layers = ['chunk', 'user_text', 'query'];
    for (const layerType of layers) {
      for (const p of pts) {
        if (p.type !== layerType) continue;
        const cx  = this._toX(p.x);
        const cy  = this._toY(p.y);
        const rgb = p.color_rgb || '59,130,246';
        const hex = p.color_hex || '#3B82F6';
        const isHoveredText = p.type === 'user_text' &&
          this._hoverIdx != null && p.text_index === this._hoverIdx;

        if (p.type === 'chunk') {
          const sim = p.similarity ?? null;
          let fill, stroke, radius;
          if (hasQuery && sim !== null) {
            // Similarity heat map — model-independent, same scale across all models.
            // hue 0°=red (dissimilar) → 60°=yellow → 120°=green (very similar)
            const sc = this._simColor(sim);
            fill   = sc.fill;
            stroke = sc.stroke;
            radius = 5 + sim * 3;           // bigger circle = more similar
          } else {
            fill   = 'rgba(100,116,139,0.18)';
            stroke = 'rgba(100,116,139,0.42)';
            radius = 5;
          }
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.5;
          ctx.stroke();

        } else if (p.type === 'user_text') {
          const sz = 9;

          // Glow ring when same text is hovered across models
          if (isHoveredText) {
            ctx.beginPath();
            ctx.arc(cx, cy, sz + 7, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${rgb},0.12)`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, sz + 5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${rgb},0.5)`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Triangle
          ctx.beginPath();
          ctx.moveTo(cx, cy - sz);
          ctx.lineTo(cx + sz, cy + sz * 0.6);
          ctx.lineTo(cx - sz, cy + sz * 0.6);
          ctx.closePath();
          ctx.fillStyle = isHoveredText ? `rgba(${rgb},1)` : `rgba(${rgb},0.88)`;
          ctx.fill();
          ctx.strokeStyle = hex;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Label above triangle
          const lbl = p.label.length > 20 ? p.label.slice(0, 20) + '…' : p.label;
          ctx.fillStyle = isHoveredText ? '#fff' : hex;
          ctx.font = `${isHoveredText ? '700' : '600'} 10px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(lbl, cx, cy - sz - 6);

        } else if (p.type === 'query') {
          this._drawStar(ctx, cx, cy, 12, 5, 5, rgb, hex);
          // Short model label BELOW star to avoid collision with triangle labels above
          const ms = MODEL_SHORT[p.model_key] || (p.model_key || '').slice(0, 6);
          ctx.fillStyle = hex;
          ctx.font = 'bold 9px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Q · ' + ms, cx, cy + 22);
        }
      }
    }

    ctx.restore(); // end clip
  }

  // Returns fill / stroke / badge colors for a similarity value in [0, 1].
  // Hue goes 0° (red, dissimilar) → 60° (yellow) → 120° (green, similar).
  // Completely model-independent — same scale across all embedding models.
  _simColor(sim) {
    const s   = Math.max(0, Math.min(1, sim));
    const hue = Math.round(s * 120);
    const sat = 88;
    const lit = 44 + Math.round(s * 12);   // 44%–56%, brighter when more similar
    const a   = (0.25 + s * 0.68).toFixed(2);
    return {
      fill:   `hsla(${hue},${sat}%,${lit}%,${a})`,
      stroke: `hsla(${hue},${sat}%,${lit + 14}%,0.92)`,
      solid:  `hsl(${hue},${sat}%,${lit + 6}%)`,
    };
  }

  _drawStar(ctx, cx, cy, outerR, innerR, nPts, rgb, hex) {
    ctx.beginPath();
    for (let i = 0; i < nPts * 2; i++) {
      const angle = (i * Math.PI) / nPts - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${rgb},0.95)`;
    ctx.fill();
    ctx.strokeStyle = hex;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── Events ───────────────────────────────────────────────────────

  _bindEvents() {
    this._tip = document.createElement('div');
    this._tip.className = 'pg-tooltip';
    document.body.appendChild(this._tip);

    this.canvas.addEventListener('mousemove',  this._onMove);
    this.canvas.addEventListener('mouseleave', this._onLeave);
    this.canvas.addEventListener('wheel',      this._onWheel, { passive: false });
    this.canvas.addEventListener('mousedown',  this._onDown);
    this.canvas.addEventListener('mouseup',    this._onUp);
    this.canvas.addEventListener('dblclick',   this._onDbl);
  }

  _handleWheel(e) {
    e.preventDefault();
    if (this._plotCX == null) return;   // guard: render not yet complete
    const rect   = this.canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.22 : 1 / 1.22;
    const newScale = Math.max(0.35, Math.min(14, this._scale * factor));
    const ratio  = newScale / this._scale;
    this._panX   = (mx - this._plotCX) * (1 - ratio) + this._panX * ratio;
    this._panY   = (my - this._plotCY) * (1 - ratio) + this._panY * ratio;
    this._scale  = newScale;
    this._render();
  }

  _handleDown(e) {
    this._dragging   = true;
    this._dragOrigin = { x: e.clientX - this._panX, y: e.clientY - this._panY };
  }

  _handleUp() {
    this._dragging = false;
  }

  _handleDbl() {
    this._scale = 1; this._panX = 0; this._panY = 0;
    this._render();
  }

  _handleMove(e) {
    // Pan drag
    if (this._dragging) {
      this.canvas.style.cursor = 'grabbing';
      this._panX = e.clientX - this._dragOrigin.x;
      this._panY = e.clientY - this._dragOrigin.y;
      if (this._tip) this._tip.style.display = 'none';
      this._render();
      return;
    }

    const rect  = this.canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    let found   = null;
    let minDist = 18;

    for (const p of this.points) {
      if (!this._toX) break;
      const px = this._toX(p.x);
      const py = this._toY(p.y);
      const d  = Math.hypot(mx - px, my - py);
      if (d < minDist) { minDist = d; found = p; }
    }

    // Update hover highlight state
    const newHoverIdx = (found?.type === 'user_text') ? found.text_index : null;
    if (newHoverIdx !== this._hoverIdx) {
      this._hoverIdx = newHoverIdx;
      this._render();
    }

    if (found) {
      this.canvas.style.cursor = 'crosshair';
      const modelCol = found.color_hex || '#64748B';
      let html = '';

      if (found.type === 'query') {
        html += `<span class="pg-tip-badge" style="background:${modelCol}22;border:1px solid ${modelCol}66;color:${modelCol}">Query</span>`;
      } else if (found.type === 'user_text') {
        html += `<span class="pg-tip-badge" style="background:${modelCol}22;border:1px solid ${modelCol}66;color:${modelCol}">Sentence</span>`;
      } else {
        // Chunk badge uses sim heat-map color, not model color
        const sc  = found.similarity != null ? this._simColor(found.similarity) : null;
        const bCol = sc ? sc.solid : '#64748B';
        html += `<span class="pg-tip-badge" style="background:${bCol}22;border:1px solid ${bCol}88;color:${bCol}">Chunk #${found.chunk_index ?? ''}</span>`;
      }

      if (found.model_key) {
        html += `<span class="pg-tip-model" style="color:${modelCol}">${this._modelLabel(found.model_key)}</span>`;
      }

      const txt = found.full_text || found.label;
      html += `<div class="pg-tip-text">${this._esc(txt.slice(0, 180))}</div>`;

      if (found.similarity != null) {
        const pct  = (found.similarity * 100).toFixed(1);
        // Bar color: sim heat map for chunks, model color for sentences/query
        const barCol = found.type === 'chunk'
          ? this._simColor(found.similarity).solid
          : modelCol;
        html += `<div class="pg-tip-sim">
          <div class="pg-tip-sim-bar" style="width:${pct}%;background:${barCol}"></div>
          <span>cosine ${found.similarity.toFixed(4)}</span>
        </div>`;
      }

      this._tip.innerHTML = html;
      this._tip.style.display = 'block';
      let left = e.clientX + 14;
      let top  = e.clientY - 8;
      const tipW = this._tip.offsetWidth || 240;
      if (left + tipW > window.innerWidth - 8) left = e.clientX - tipW - 14;
      this._tip.style.left = left + 'px';
      this._tip.style.top  = top  + 'px';
    } else {
      this.canvas.style.cursor = this._dragging ? 'grabbing' : 'default';
      if (this._tip) this._tip.style.display = 'none';
    }
  }

  _handleLeave() {
    this._dragging = false;
    this._hoverIdx = null;
    if (this._tip) this._tip.style.display = 'none';
    this.canvas.style.cursor = 'default';
    this._render();
  }

  _modelLabel(key) {
    const map = {
      all_mpnet_base_v2: 'all-mpnet-base-v2',
      all_minilm_l6_v2:  'all-MiniLM-L6-v2',
      all_minilm_l12_v2: 'all-MiniLM-L12-v2',
      multi_qa_mpnet:    'multi-qa-mpnet',
      bge_small_en:      'bge-small-en-v1.5',
      bge_base_en:       'bge-base-en-v1.5',
    };
    return map[key] || key;
  }

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}


// ── PlaygroundView ────────────────────────────────────────────────
class PlaygroundView {
  constructor() {
    this._scatters = {};
    this._embedders = [];
    this._inited = false;
  }

  async ensureInit() {
    if (this._inited) return;
    this._inited = true;
    await this._loadEmbedders();
    await this._loadPipelines();
    this._addDefaultText();
    this._bindEvents();
  }

  async refresh() {
    await this._loadPipelines();
  }

  // ── Data loading ────────────────────────────────────────────────

  async _loadEmbedders() {
    try {
      this._embedders = await api.getEmbedders();
      this._renderModelList();
    } catch (e) {
      console.error('Playground: failed to load embedders', e);
    }
  }

  async _loadPipelines() {
    try {
      const all   = await api.listPipelines('');
      const ready = all.filter(p => p.status === 'completed' || p.status === 'cached');
      const sel   = document.getElementById('pgPipelineSelect');
      if (!sel) return;
      sel.innerHTML = '<option value="">— none (text only) —</option>' +
        ready.map(p =>
          `<option value="${p.pipeline_id}">${this._esc(p.config_summary || p.pipeline_id.slice(0, 20))} (${p.chunk_count} chunks)</option>`
        ).join('');
    } catch (e) {
      console.error('Playground: failed to load pipelines', e);
    }
  }

  _renderModelList() {
    const el = document.getElementById('pgModelList');
    if (!el) return;
    el.innerHTML = this._embedders.map((em, i) => {
      const col = MODEL_COLORS[em.name] || MODEL_COLOR_FALLBACK;
      return `<label class="pg-model-item">
        <input type="checkbox" class="pg-model-check" value="${em.name}" ${i === 0 ? 'checked' : ''}/>
        ${modelShapeSVG(col, 14)}
        <span class="pg-model-name">${em.model_name || em.name}</span>
        <span class="pg-model-dim">${em.dimension}d</span>
      </label>`;
    }).join('');
  }

  _addDefaultText() {
    this._addText('Machine learning transforms raw data into predictions.');
    this._addText('Deep neural networks learn hierarchical representations.');
  }

  // ── Event binding ───────────────────────────────────────────────

  _bindEvents() {
    document.getElementById('pgAddTextBtn')
      ?.addEventListener('click', () => this._addText(''));
    document.getElementById('pgVisualizeBtn')
      ?.addEventListener('click', () => this._visualize());
    document.getElementById('pgQueryInput')
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') this._visualize(); });
    document.getElementById('pgClearBtn')
      ?.addEventListener('click', () => {
        document.getElementById('pgTextsContainer').innerHTML = '';
        this._addText('');
      });
  }

  _addText(value = '') {
    const container = document.getElementById('pgTextsContainer');
    if (!container) return;
    const idx = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'pg-text-row';
    row.innerHTML = `
      <span class="pg-text-num">${idx}</span>
      <input type="text" class="field-input pg-text-input"
             placeholder="Enter a sentence or phrase…" value="${this._esc(value)}"/>
      <button class="btn btn-ghost btn-icon pg-remove-btn" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    row.querySelector('.pg-remove-btn').addEventListener('click', () => {
      row.remove();
      this._renumberTexts();
    });
    row.querySelector('.pg-text-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._addText('');
    });
    container.appendChild(row);
    if (value === '') row.querySelector('.pg-text-input').focus();
  }

  _renumberTexts() {
    document.querySelectorAll('#pgTextsContainer .pg-text-num').forEach((el, i) => {
      el.textContent = i + 1;
    });
  }

  // ── Visualization ───────────────────────────────────────────────

  async _visualize() {
    const texts  = [...document.querySelectorAll('.pg-text-input')]
      .map(i => i.value.trim()).filter(Boolean);
    const models = [...document.querySelectorAll('.pg-model-check:checked')]
      .map(c => c.value);
    const pipelineId = document.getElementById('pgPipelineSelect')?.value || null;
    const query      = document.getElementById('pgQueryInput')?.value?.trim() || null;
    const maxChunks  = parseInt(document.getElementById('pgMaxChunks')?.value || '30', 10);

    if (!models.length || (!texts.length && !pipelineId && !query)) return;

    const btn = document.getElementById('pgVisualizeBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Embedding…';

    const chartsArea  = document.getElementById('pgChartsArea');
    const rankingArea = document.getElementById('pgRankingArea');
    chartsArea.innerHTML  = '<div class="pg-loading"><span class="spinner spinner-lg"></span><p>Projecting embedding space to 2D…</p></div>';
    rankingArea.innerHTML = '';

    Object.values(this._scatters).forEach(s => s.destroy());
    this._scatters = {};

    try {
      const result = await api.playgroundVisualize({
        texts,
        models,
        pipeline_id: pipelineId || undefined,
        query:       query      || undefined,
        max_chunks:  maxChunks,
      });
      this._renderCharts(result, models, query);
      this._renderRanking(result, models, query);
    } catch (e) {
      chartsArea.innerHTML = `<div class="alert alert-error">${this._esc(e.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.07 4.93l-1.41 1.41M20 12h2M12 2v2M12 20v2M2 12h2M5.34 18.66l-1.41 1.41M18.66 5.34l1.41-1.41"/>
        </svg>
        Visualize`;
    }
  }

  // ── Combined chart rendering ────────────────────────────────────

  _renderCharts(result, models, query) {
    const chartsArea   = document.getElementById('pgChartsArea');
    const validModels  = models.filter(m => result[m] && !result[m].error && result[m].points?.length);
    const errorModels  = models.filter(m => result[m]?.error);

    if (!validModels.length) {
      const errs = errorModels.map(m =>
        `<div class="alert alert-error" style="margin:4px 0">${this._esc(m)}: ${this._esc(result[m].error)}</div>`
      ).join('');
      chartsArea.innerHTML = `<div style="padding:24px">${errs || '<p>No data.</p>'}</div>`;
      return;
    }

    // Normalize each model's PCA coords independently to [-1, 1] then merge
    const allPoints = [];
    for (const m of validModels) {
      const col = MODEL_COLORS[m] || MODEL_COLOR_FALLBACK;
      const pts = result[m].points;
      const xs  = pts.map(p => p.x), ys = pts.map(p => p.y);
      const xMin = Math.min(...xs), xMax = Math.max(...xs);
      const yMin = Math.min(...ys), yMax = Math.max(...ys);
      const xR   = xMax - xMin || 1, yR = yMax - yMin || 1;
      for (const p of pts) {
        allPoints.push({
          ...p,
          x:          (p.x - xMin) / xR * 2 - 1,
          y:          (p.y - yMin) / yR * 2 - 1,
          model_key:  m,
          color_hex:  col.hex,
          color_rgb:  col.rgb,
        });
      }
    }

    const modelLegend = validModels.map(m => {
      const col  = MODEL_COLORS[m] || MODEL_COLOR_FALLBACK;
      const data = result[m];
      const qCount = data.points.filter(p => p.type === 'query').length;
      return `<span class="pg-ml-item">
        ${modelShapeSVG(col, 13)}
        <span class="pg-ml-name">${this._modelLabel(m)}</span>
        <span class="pg-ml-dim">${data.dimension}d</span>
        ${qCount ? `<span class="pg-ml-q" style="color:${col.hex}" title="Has query point">◆Q</span>` : ''}
      </span>`;
    }).join('');

    const chunkCount = validModels.reduce((s, m) => s + (result[m].chunk_count || 0), 0);
    const errBanner  = errorModels.length
      ? `<div class="alert alert-warn" style="margin:8px 16px 0;font-size:12px">
           Could not embed: ${errorModels.map(m => `<strong>${this._esc(m)}</strong>`).join(', ')}
         </div>` : '';

    chartsArea.innerHTML = `
      ${errBanner}
      <div class="pg-chart-card">
        <div class="pg-chart-title">
          <span>Combined Embedding Space</span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="chip">${validModels.length} model${validModels.length > 1 ? 's' : ''}</span>
            <span class="chip">${allPoints.length} pts</span>
            ${chunkCount ? `<span class="chip">${Math.round(chunkCount / validModels.length)} chunks/model</span>` : ''}
          </div>
        </div>
        <div class="pg-model-legend-row">${modelLegend}</div>
        <div class="pg-canvas-wrap">
          <canvas id="pgCanvasCombined" class="pg-canvas"></canvas>
        </div>
        <div class="pg-chart-legend">
          <span class="pg-leg"><svg viewBox="0 0 14 14" width="11" height="11" fill="#0F766E" style="display:inline-block;vertical-align:middle;margin-right:3px"><polygon points="7,1.5 13,12.5 1,12.5"/></svg>Your texts</span>
          ${query ? '<span class="pg-leg"><svg viewBox="0 0 14 14" width="11" height="11" fill="#D97706" style="display:inline-block;vertical-align:middle;margin-right:3px"><polygon points="7,1.5 8.6,5.6 13.5,5.6 9.6,8.5 11,13 7,10 3,13 4.4,8.5 0.5,5.6 5.4,5.6"/></svg>Query per model</span>' : ''}
          ${chunkCount && !query  ? '<span class="pg-leg"><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:linear-gradient(to right,#EF4444,#D97706,#22C55E);vertical-align:middle;margin-right:3px"></span>Chunks</span>' : ''}
          ${chunkCount &&  query  ? '<span class="pg-leg"><span style="display:inline-block;width:26px;height:7px;border-radius:4px;background:linear-gradient(to right,#EF4444,#D97706,#22C55E);vertical-align:middle;margin-right:3px"></span><span>Chunks — <span style="color:#EF4444">low</span> → <span style="color:#D97706">mid</span> → <span style="color:#22C55E">high</span> similarity · bigger = closer</span></span>' : ''}
          ${validModels.length > 1 ? '<span class="pg-leg"><span class="pg-leg-dash"></span>Same text, diff model</span>' : ''}
          <span class="pg-leg pg-leg--hint">Scroll to zoom · Drag to pan · Dbl-click reset</span>
        </div>
      </div>`;

    requestAnimationFrame(() => {
      const canvas = document.getElementById('pgCanvasCombined');
      if (!canvas) return;
      this._scatters['combined'] = new EmbScatter(canvas, allPoints);
    });
  }

  // ── Similarity ranking ──────────────────────────────────────────

  _renderRanking(result, models, query) {
    const el = document.getElementById('pgRankingArea');
    if (!query) { el.innerHTML = ''; return; }

    const sections = models.map(m => {
      const data = result[m];
      if (!data?.similarity_ranking?.length) return '';
      const col = MODEL_COLORS[m] || MODEL_COLOR_FALLBACK;

      const rows = data.similarity_ranking.map(r => {
        const pct = ((r.similarity || 0) * 100).toFixed(1);
        const hue = Math.round((r.similarity || 0) * 120);
        const badge = r.source === 'text'
          ? `<span class="pg-rank-src pg-rank-src--text" style="border-color:${col.hex};color:${col.hex}">sentence</span>`
          : `<span class="pg-rank-src pg-rank-src--chunk">chunk</span>`;
        return `<div class="pg-rank-row">
          <div class="pg-rank-meta">
            <span class="pg-rank-num">#${r.rank}</span>
            ${badge}
            <span class="pg-rank-score" style="color:hsl(${hue},75%,62%)">${(r.similarity || 0).toFixed(4)}</span>
          </div>
          <div class="pg-rank-bar-wrap">
            <div class="pg-rank-bar" style="width:${pct}%;background:hsl(${hue},70%,40%)"></div>
          </div>
          <p class="pg-rank-text">${this._esc((r.full_text || r.preview).slice(0, 200))}</p>
        </div>`;
      }).join('');

      return `<div class="pg-rank-card">
        <div class="pg-rank-card-title" style="border-left:3px solid ${col.hex};padding-left:8px">
          ${modelShapeSVG(col, 13)}
          ${this._esc(this._modelLabel(m))}
          <span class="chip" style="font-size:10px;margin-left:auto">cosine similarity</span>
        </div>
        <div class="pg-rank-list">${rows}</div>
      </div>`;
    }).filter(Boolean).join('');

    if (!sections) { el.innerHTML = ''; return; }

    el.innerHTML = `<div class="pg-ranking-wrap">
      <div class="pg-ranking-hdr">
        <h3>Similarity Ranking</h3>
        <p>Sentences &amp; chunks ranked by cosine similarity to: <em>"${this._esc(query)}"</em></p>
      </div>
      <div class="pg-rank-grid${models.length === 1 ? ' pg-rank-grid--single' : ''}">${sections}</div>
    </div>`;
  }

  // ── Helpers ─────────────────────────────────────────────────────

  _modelLabel(key) {
    const map = {
      all_mpnet_base_v2: 'all-mpnet-base-v2',
      all_minilm_l6_v2:  'all-MiniLM-L6-v2',
      all_minilm_l12_v2: 'all-MiniLM-L12-v2',
      multi_qa_mpnet:    'multi-qa-mpnet',
      bge_small_en:      'bge-small-en-v1.5',
      bge_base_en:       'bge-base-en-v1.5',
    };
    return map[key] || key;
  }

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
